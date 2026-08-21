/**
 * RealSifenAdapter — full implementation over the four TIPS S.A. libraries.
 * Selected when SIFEN_MODE=test or SIFEN_MODE=production.
 *
 * Requirements (see README "WHEN THE CERTIFICATE ARRIVES"):
 *  - .p12 certificate: either CERT_P12_PATH on disk, or uploaded in Settings
 *    (stored AES-256-GCM–encrypted; decrypted to a runtime file on demand).
 *  - CERT_P12_PASSWORD (or the password stored encrypted with the upload).
 *  - SIFEN_CSC + SIFEN_CSC_ID for QR generation.
 *
 * This code is complete; it can only be smoke-tested once a real certificate
 * exists. TODO(cert) markers show where real values are required at runtime.
 */
import xmlgen from "facturacionelectronicapy-xmlgen";
import xmlsign from "facturacionelectronicapy-xmlsign";
import setApi from "facturacionelectronicapy-setapi";
import qrgen from "facturacionelectronicapy-qrgen";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { decrypt, decryptToString } from "@/lib/crypto";
import { storageDir } from "@/lib/storage";
import type {
  CompanyConfig,
  InvoiceData,
  RucInfo,
  SifenAdapter,
  SifenMode,
  SifenResponse,
  SifenStatus,
} from "./types";
import { splitRuc } from "./ruc";
import { extractCdc } from "./mock-adapter";

type SetApiEnv = "test" | "prod";

export class RealSifenAdapter implements SifenAdapter {
  constructor(
    private company: CompanyConfig,
    public readonly mode: Exclude<SifenMode, "mock">
  ) {}

  private get env(): SetApiEnv {
    return this.mode === "production" ? "prod" : "test";
  }

  /**
   * Resolves the certificate to a real file path + password.
   * Priority: CERT_P12_PATH env → certificate uploaded via Settings
   * (decrypted to storage/certs/runtime.p12 with mode 600).
   */
  private async resolveCert(): Promise<{ certPath: string; password: string }> {
    const envPath = process.env.CERT_P12_PATH;
    if (envPath && fs.existsSync(envPath)) {
      const password = process.env.CERT_P12_PASSWORD;
      if (!password) {
        // TODO(cert): set CERT_P12_PASSWORD when the certificate arrives.
        throw new Error("CERT_P12_PASSWORD is not set");
      }
      return { certPath: envPath, password };
    }

    // Scoped to this adapter's company: with more than one tenant, "the first
    // company" would hand over the wrong certificate (PLAN Phase 6.4).
    const company = this.company.companyId
      ? await prisma.company.findUnique({ where: { id: this.company.companyId } })
      : await prisma.company.findFirst();
    if (company?.certPath && company.certPasswordEnc) {
      const encrypted = await fs.promises.readFile(company.certPath);
      const runtimePath = path.join(storageDir("certs"), "runtime.p12");
      await fs.promises.writeFile(runtimePath, decrypt(encrypted.toString("utf8")), {
        mode: 0o600,
      });
      return {
        certPath: runtimePath,
        password: decryptToString(company.certPasswordEnc),
      };
    }

    // TODO(cert): upload the .p12 in Settings or set CERT_P12_PATH.
    throw new Error(
      "No digital certificate configured (upload the .p12 in Settings or set CERT_P12_PATH)"
    );
  }

  async generateXml(invoice: InvoiceData, company: CompanyConfig): Promise<string> {
    return xmlgen.generateXMLDE(company, invoice);
  }

  async signXml(xml: string): Promise<string> {
    const { certPath, password } = await this.resolveCert();
    const signed = await xmlsign.signXML(xml, certPath, password);
    if (typeof signed !== "string" || !signed.includes("Signature")) {
      throw new Error("xmlsign did not return a signed XML document");
    }
    return signed;
  }

  async send(signedXml: string): Promise<SifenResponse> {
    const { certPath, password } = await this.resolveCert();
    const id = Date.now() % 1_000_000_000;
    const raw = await setApi.recibe(id, signedXml, this.env, certPath, password);
    return parseSendResponse(raw, extractCdc(signedXml));
  }

  async queryStatus(cdc: string): Promise<SifenStatus> {
    const { certPath, password } = await this.resolveCert();
    const id = Date.now() % 1_000_000_000;
    const raw = await setApi.consulta(id, cdc, this.env, certPath, password);
    const parsed = parseSendResponse(raw, cdc);
    return {
      cdc,
      estado: parsed.estado,
      code: parsed.code,
      message: parsed.message,
      raw: parsed.raw,
    };
  }

  async queryRuc(rucInput: string): Promise<RucInfo> {
    const { certPath, password } = await this.resolveCert();
    const parts = splitRuc(rucInput);
    const rucSinDv = parts ? parts.ruc : rucInput.replace(/\D/g, "");
    const id = Date.now() % 1_000_000_000;
    const raw = await setApi.consultaRUC(id, rucSinDv, this.env, certPath, password);
    const rawStr = asString(raw);
    const razonSocial = firstTag(rawStr, "dRazCons") ?? firstTag(rawStr, "xNomCons") ?? "";
    const dv = firstTag(rawStr, "dDVCons") ?? parts?.dv ?? "";
    const estado = firstTag(rawStr, "dDesEstCons") ?? firstTag(rawStr, "dCodEstCons") ?? "";
    const facElec = firstTag(rawStr, "dRUCFactElec");
    if (!razonSocial) {
      const code = firstTag(rawStr, "dCodRes");
      const msg = firstTag(rawStr, "dMsgRes");
      throw new Error(`SIFEN: ${code ?? ""} ${msg ?? "RUC no encontrado"}`.trim());
    }
    return {
      ruc: rucSinDv,
      dv,
      razonSocial,
      estado,
      facturadorElectronico: facElec ? facElec.toUpperCase() === "S" : undefined,
      raw: rawStr,
    };
  }

  async cancelDocument(cdc: string, reason: string): Promise<SifenResponse> {
    const { certPath, password } = await this.resolveCert();
    const id = Date.now() % 1_000_000_000;
    const eventoXml = await xmlgen.generateXMLEventoCancelacion(id, this.company, {
      cdc,
      motivo: reason,
    });
    const signed = await xmlsign.signXMLEvento(eventoXml, certPath, password);
    const raw = await setApi.evento(id, signed, this.env, certPath, password);
    return parseSendResponse(raw, cdc);
  }

  async generateQr(signedXml: string): Promise<string> {
    const csc = process.env.SIFEN_CSC;
    const cscId = process.env.SIFEN_CSC_ID || "0001";
    if (!csc) {
      // TODO(cert): set SIFEN_CSC (Código de Seguridad del Contribuyente from DNIT).
      throw new Error("SIFEN_CSC is not set — required to generate the QR");
    }
    const result = await qrgen.generateQR(signedXml, cscId, csc, this.env);
    if (typeof result !== "string") {
      throw new Error("qrgen did not return a QR string");
    }
    return result;
  }
}

// ── Response parsing ─────────────────────────────────────────────────────────
// setapi resolves with parsed objects or raw XML depending on operation and
// version, so parse defensively from the serialized form.

function asString(raw: unknown): string {
  if (typeof raw === "string") return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

function firstTag(xml: string, tag: string): string | null {
  // Matches <ns:tag>value</ns:tag>, <tag>value</tag> and "tag":"value" (JSON).
  const xmlMatch = xml.match(new RegExp(`<(?:[A-Za-z0-9]+:)?${tag}>([^<]*)</`));
  if (xmlMatch) return xmlMatch[1].trim() || null;
  const jsonMatch = xml.match(new RegExp(`"${tag}"\\s*:\\s*"([^"]*)"`));
  if (jsonMatch) return jsonMatch[1].trim() || null;
  return null;
}

export function parseSendResponse(raw: unknown, cdc: string | null): SifenResponse {
  const rawStr = asString(raw);
  const code = firstTag(rawStr, "dCodRes") ?? undefined;
  const message = firstTag(rawStr, "dMsgRes") ?? undefined;
  const estadoStr = (firstTag(rawStr, "dEstRes") ?? "").toLowerCase();
  const protocol = firstTag(rawStr, "dProtAut") ?? firstTag(rawStr, "dProtConsLote") ?? undefined;

  let estado: SifenResponse["estado"] = "Desconocido";
  if (estadoStr.startsWith("aprob") || code === "0260" || code === "0261") estado = "Aprobado";
  else if (estadoStr.startsWith("rechaz")) estado = "Rechazado";
  else if (code === "0300" || code === "0301") estado = "Pendiente";
  else if (code) estado = "Rechazado";

  return {
    success: estado === "Aprobado",
    estado,
    code,
    message,
    protocol,
    cdc: cdc ?? firstTag(rawStr, "Id") ?? undefined,
    raw: rawStr,
  };
}
