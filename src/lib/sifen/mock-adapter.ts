/**
 * MockSifenAdapter — works TODAY with no digital certificate.
 *
 * - generateXml uses the REAL xmlgen library, so the XML structure (and the
 *   CDC embedded in it) is validated for real.
 * - signXml wraps the XML with a clearly-fake <Signature> block.
 * - send simulates SIFEN: ~90% approvals, ~10% rejections with realistic
 *   error codes so the error-handling UI can be exercised.
 * - queryRuc validates the check digit locally and returns clearly-simulated
 *   data for any structurally valid RUC.
 */
import xmlgen from "facturacionelectronicapy-xmlgen";
import crypto from "crypto";
import type {
  CompanyConfig,
  InvoiceData,
  RucInfo,
  SifenAdapter,
  SifenResponse,
  SifenStatus,
} from "./types";
import { MOCK_REJECTIONS } from "./errors";
import { calcularDigitoVerificador, splitRuc } from "./ruc";

const FAKE_SIGNATURE = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/></SignedInfo><SignatureValue>TU9DSy1TSUdOQVRVUkUtTk8tVkFMSURB</SignatureValue><KeyInfo><X509Data><X509Certificate>TU9DSy1DRVJULU5PLVZBTElEQQ==</X509Certificate></X509Data></KeyInfo></Signature>`;

export function extractCdc(xml: string): string | null {
  const m = xml.match(/Id="(\d{44})"/);
  return m ? m[1] : null;
}

export class MockSifenAdapter implements SifenAdapter {
  readonly mode = "mock" as const;

  constructor(private company: CompanyConfig) {}

  async generateXml(invoice: InvoiceData, company: CompanyConfig): Promise<string> {
    // Real library call — validates every field against the Manual Técnico.
    return xmlgen.generateXMLDE(company, invoice);
  }

  async signXml(xml: string): Promise<string> {
    // Insert an obviously-fake signature where the real one would go.
    if (xml.includes("</rDE>")) {
      return xml.replace("</rDE>", `${FAKE_SIGNATURE}</rDE>`);
    }
    return xml + FAKE_SIGNATURE;
  }

  async send(signedXml: string): Promise<SifenResponse> {
    const cdc = extractCdc(signedXml);
    if (!cdc) {
      return {
        success: false,
        estado: "Rechazado",
        code: "9999",
        message: "Simulación: no se encontró un CDC de 44 dígitos en el XML",
        raw: mockResponseXml("Rechazado", "9999", "CDC no encontrado", cdc),
      };
    }
    const approve = Math.random() < 0.9;
    if (approve) {
      const protocol = String(Math.floor(Math.random() * 9e9) + 1e9);
      return {
        success: true,
        estado: "Aprobado",
        code: "0260",
        message: "Autorización del DE satisfactoria (SIMULADO)",
        protocol,
        cdc,
        raw: mockResponseXml("Aprobado", "0260", "Autorización del DE satisfactoria (SIMULADO)", cdc, protocol),
      };
    }
    const rejection = MOCK_REJECTIONS[Math.floor(Math.random() * MOCK_REJECTIONS.length)];
    return {
      success: false,
      estado: "Rechazado",
      code: rejection.code,
      message: rejection.message,
      cdc,
      raw: mockResponseXml("Rechazado", rejection.code, rejection.message, cdc),
    };
  }

  async queryStatus(cdc: string): Promise<SifenStatus> {
    return {
      cdc,
      estado: "Aprobado",
      code: "0422",
      message: "Documento encontrado (SIMULADO)",
      raw: mockResponseXml("Aprobado", "0260", "Documento aprobado (SIMULADO)", cdc),
    };
  }

  async queryRuc(rucInput: string): Promise<RucInfo> {
    const parts = splitRuc(rucInput) ?? {
      ruc: rucInput.replace(/\D/g, ""),
      dv: String(calcularDigitoVerificador(rucInput.replace(/\D/g, ""))),
    };
    const expectedDv = calcularDigitoVerificador(parts.ruc);
    if (String(expectedDv) !== parts.dv) {
      throw new Error(`RUC inválido: dígito verificador incorrecto (esperado ${expectedDv})`);
    }
    return {
      ruc: parts.ruc,
      dv: parts.dv,
      razonSocial: `CONTRIBUYENTE SIMULADO ${parts.ruc}`,
      estado: "ACTIVO",
      facturadorElectronico: true,
      raw: `<mock>consulta RUC simulada para ${parts.ruc}-${parts.dv}</mock>`,
    };
  }

  async cancelDocument(cdc: string, reason: string): Promise<SifenResponse> {
    // Build the real cancellation-event XML so the flow is structurally real.
    let requestXml = "";
    try {
      requestXml = await xmlgen.generateXMLEventoCancelacion(
        1,
        this.company,
        { cdc, motivo: reason }
      );
    } catch (err) {
      return {
        success: false,
        estado: "Rechazado",
        code: "9999",
        message: `Simulación: error generando evento de cancelación: ${(err as Error).message}`,
      };
    }
    void requestXml;
    return {
      success: true,
      estado: "Aprobado",
      code: "0600",
      message: "Evento de cancelación registrado (SIMULADO)",
      cdc,
      raw: mockResponseXml("Aprobado", "0600", "Evento registrado (SIMULADO)", cdc),
    };
  }

  async generateQr(signedXml: string): Promise<string> {
    const cdc = extractCdc(signedXml) ?? "0".repeat(44);
    // Same URL shape the real qrgen produces, against the TEST consultation
    // site, with a hash derived from the XML (clearly not a valid CSC hash).
    const digest = crypto.createHash("sha256").update(signedXml).digest("hex");
    const params = new URLSearchParams({
      nVersion: "150",
      Id: cdc,
      dFeEmiDE: Buffer.from(new Date().toISOString().slice(0, 19)).toString("hex"),
      cHashQR: digest,
    });
    return `https://ekuatia.set.gov.py/consultas-test/qr?${params.toString()}`;
  }
}

function mockResponseXml(
  estado: string,
  code: string,
  message: string,
  cdc: string | null,
  protocol?: string
): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- RESPUESTA SIMULADA (SIFEN_MODE=mock) — sin valor fiscal -->`,
    `<ns2:rRetEnviDe xmlns:ns2="http://ekuatia.set.gov.py/sifen/xsd">`,
    `  <ns2:rProtDe>`,
    cdc ? `    <ns2:Id>${cdc}</ns2:Id>` : "",
    `    <ns2:dEstRes>${estado}</ns2:dEstRes>`,
    protocol ? `    <ns2:dProtAut>${protocol}</ns2:dProtAut>` : "",
    `    <ns2:gResProc><ns2:dCodRes>${code}</ns2:dCodRes><ns2:dMsgRes>${message}</ns2:dMsgRes></ns2:gResProc>`,
    `  </ns2:rProtDe>`,
    `</ns2:rRetEnviDe>`,
  ]
    .filter(Boolean)
    .join("\n");
}
