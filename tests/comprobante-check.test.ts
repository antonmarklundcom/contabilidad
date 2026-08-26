import { describe, it, expect } from "vitest";
import {
  checkCdcLocally,
  cdcDateToIso,
  cdcFullNumber,
  verdictFor,
  verifyComprobante,
  type CheckFinding,
} from "@/lib/comprobante-check";
import { buildCdc, isValidCdcFormat, parseCdc } from "@/lib/sifen/cdc";
import type { SifenStatus } from "@/lib/sifen/types";

/**
 * Verifying a received comprobante by its CDC (PLAN Phase 5.8).
 *
 * Pure fixtures throughout — the one impure function takes its adapter as an
 * argument, so the whole flow including the SIFEN branch runs with no
 * database and no certificate.
 *
 * The CDCs here are built with `buildCdc`, the real SIFEN algorithm, so the
 * check digits are genuine rather than hand-typed.
 */

const ISSUER_RUC = "80069563";
const ISSUER_DV = "1";

function cdcFor(overrides: Partial<Parameters<typeof buildCdc>[0]> = {}): string {
  return buildCdc({
    tipoDocumento: 1,
    ruc: ISSUER_RUC,
    dv: ISSUER_DV,
    establecimiento: "001",
    punto: "001",
    numero: "0000123",
    tipoContribuyente: 2,
    // buildCdc reads local-time getters, so build the date locally too —
    // a UTC midnight would slip a day west of Greenwich.
    fecha: new Date(2026, 4, 14),
    tipoEmision: 1,
    codigoSeguridad: "123456789",
    ...overrides,
  });
}

const codes = (findings: readonly CheckFinding[]) => findings.map((f) => f.code);

/** An adapter whose consulta answers however the case needs. */
const adapterReturning = (status: Partial<SifenStatus>) => ({
  queryStatus: async (cdc: string): Promise<SifenStatus> => ({
    cdc,
    estado: "Aprobado",
    ...status,
  }),
});
const adapterFailing = (message: string) => ({
  queryStatus: async (): Promise<SifenStatus> => {
    throw new Error(message);
  },
});

describe("the fixtures are real CDCs", () => {
  it("builds 44 digits with a valid módulo-11 check digit", () => {
    const cdc = cdcFor();
    expect(cdc).toHaveLength(44);
    expect(isValidCdcFormat(cdc)).toBe(true);
  });
});

describe("checkCdcLocally — structure", () => {
  it("rejects an empty CDC", () => {
    const r = checkCdcLocally("");
    expect(r.wellFormed).toBe(false);
    expect(codes(r.findings)).toEqual(["cdc_empty"]);
  });

  it("rejects a wrong length and says what it got", () => {
    const r = checkCdcLocally("0123456789");
    expect(r.wellFormed).toBe(false);
    expect(codes(r.findings)).toEqual(["cdc_bad_length"]);
    expect(r.findings[0].values?.length).toBe("10");
  });

  it("catches a single-digit typo through the check digit", () => {
    const cdc = cdcFor();
    // Flip one digit in the body; the check digit no longer agrees.
    const broken = cdc.slice(0, 20) + String((Number(cdc[20]) + 1) % 10) + cdc.slice(21);
    expect(broken).not.toBe(cdc);
    const r = checkCdcLocally(broken);
    expect(r.wellFormed).toBe(false);
    expect(codes(r.findings)).toEqual(["cdc_bad_check_digit"]);
  });

  it("accepts a well-formed CDC and reports what it encodes", () => {
    const r = checkCdcLocally(cdcFor());
    expect(r.wellFormed).toBe(true);
    expect(codes(r.findings)).toEqual(["cdc_wellformed"]);
    expect(r.findings[0].values).toMatchObject({
      ruc: `${ISSUER_RUC}-${ISSUER_DV}`,
      numero: "001-001-0000123",
      fecha: "2026-05-14",
    });
  });

  it("tolerates the spaces and hyphens people paste", () => {
    const cdc = cdcFor();
    const pasted = `${cdc.slice(0, 10)} ${cdc.slice(10, 20)}-${cdc.slice(20)}`;
    expect(checkCdcLocally(pasted).wellFormed).toBe(true);
  });
});

describe("checkCdcLocally — cross-checks against the captured expense", () => {
  const facts = {
    supplierRuc: `${ISSUER_RUC}-${ISSUER_DV}`,
    numeroComprobante: "001-001-0000123",
    fecha: new Date("2026-05-14T00:00:00.000Z"),
  };

  it("confirms a matching expense and counts what it compared", () => {
    const r = checkCdcLocally(cdcFor(), facts);
    expect(codes(r.findings)).toEqual(["cdc_wellformed", "matches_expense"]);
    expect(r.findings[1].values?.checks).toBe("3");
  });

  it("flags a different issuer as an error", () => {
    const r = checkCdcLocally(cdcFor({ ruc: "80000000", dv: "0" }), facts);
    expect(codes(r.findings)).toContain("ruc_mismatch");
    expect(r.findings.find((f) => f.code === "ruc_mismatch")?.severity).toBe("error");
  });

  it("flags a different document number as an error", () => {
    const r = checkCdcLocally(cdcFor({ numero: "0000999" }), facts);
    expect(codes(r.findings)).toContain("numero_mismatch");
    expect(r.findings.find((f) => f.code === "numero_mismatch")?.values).toMatchObject({
      captured: "001-001-0000123",
      cdc: "001-001-0000999",
    });
  });

  it("flags a different date as a WARNING, not an error", () => {
    // The CDC carries the issue date; a captured expense is sometimes dated
    // by receipt or payment. Worth showing, not worth calling fraud.
    const r = checkCdcLocally(cdcFor({ fecha: new Date(2026, 4, 20) }), facts);
    const finding = r.findings.find((f) => f.code === "fecha_mismatch");
    expect(finding?.severity).toBe("warning");
    expect(finding?.values).toMatchObject({ captured: "2026-05-14", cdc: "2026-05-20" });
  });

  it("compares a RUC with or without its DV, and with leading zeros", () => {
    const bare = checkCdcLocally(cdcFor(), { ...facts, supplierRuc: ISSUER_RUC });
    expect(codes(bare.findings)).not.toContain("ruc_mismatch");
    const padded = checkCdcLocally(cdcFor(), { ...facts, supplierRuc: `0${ISSUER_RUC}-1` });
    expect(codes(padded.findings)).not.toContain("ruc_mismatch");
  });

  it("compares an unpadded document number as equal", () => {
    const r = checkCdcLocally(cdcFor(), { ...facts, numeroComprobante: "1-1-123" });
    expect(codes(r.findings)).toEqual(["cdc_wellformed", "matches_expense"]);
  });

  it("treats a missing field as nothing to compare, not as a mismatch", () => {
    const r = checkCdcLocally(cdcFor(), { supplierRuc: null, numeroComprobante: "", fecha: null });
    expect(codes(r.findings)).toEqual(["cdc_wellformed"]);
    // Nothing compared ⇒ no "matches" claim either: we do not assert a match
    // we never made.
    expect(codes(r.findings)).not.toContain("matches_expense");
  });

  it("ignores an unparseable captured number rather than crying mismatch", () => {
    const r = checkCdcLocally(cdcFor(), { numeroComprobante: "factura vieja" });
    expect(codes(r.findings)).toEqual(["cdc_wellformed"]);
  });

  it("skips the cross-checks entirely when no expense is given", () => {
    expect(codes(checkCdcLocally(cdcFor()).findings)).toEqual(["cdc_wellformed"]);
  });
});

describe("verdictFor — precedence", () => {
  const f = (code: string, severity: "error" | "warning" | "info" = "info") =>
    ({ code, severity }) as CheckFinding;

  it("rejects a structurally impossible CDC without needing SIFEN", () => {
    expect(verdictFor([f("cdc_bad_check_digit", "error")])).toBe("rejected");
    expect(verdictFor([f("cdc_bad_length", "error")])).toBe("rejected");
    expect(verdictFor([f("cdc_empty", "error")])).toBe("rejected");
  });

  it("lets a local mismatch outrank an approval from SIFEN", () => {
    // The case a naive status check waves through: a real, approved document
    // that is simply not the one in front of you.
    expect(verdictFor([f("cdc_wellformed"), f("ruc_mismatch", "error"), f("sifen_approved")])).toBe(
      "mismatch"
    );
  });

  it("never upgrades 'could not ask' into 'verified'", () => {
    expect(verdictFor([f("cdc_wellformed"), f("sifen_unreachable", "warning")])).toBe("unknown");
  });

  it("rejects a document SIFEN does not call approved", () => {
    expect(verdictFor([f("cdc_wellformed"), f("sifen_not_approved", "error")])).toBe("rejected");
  });

  it("prefers 'rejected' over 'mismatch' when SIFEN itself refuses the document", () => {
    // Both are wrong, but "SIFEN says this is not a good document" is the
    // stronger statement than "it is not the one you were handed".
    expect(
      verdictFor([f("cdc_wellformed"), f("ruc_mismatch", "error"), f("sifen_not_approved", "error")])
    ).toBe("rejected");
  });

  it("verifies only when everything lines up", () => {
    expect(verdictFor([f("cdc_wellformed"), f("matches_expense"), f("sifen_approved")])).toBe(
      "verified"
    );
  });

  it("does not let a warning alone block a verification", () => {
    expect(
      verdictFor([f("cdc_wellformed"), f("fecha_mismatch", "warning"), f("sifen_approved")])
    ).toBe("verified");
  });
});

describe("verifyComprobante", () => {
  it("never asks SIFEN about a CDC that cannot be one", async () => {
    let asked = false;
    const adapter = {
      queryStatus: async (): Promise<SifenStatus> => {
        asked = true;
        return { cdc: "", estado: "Aprobado" };
      },
    };
    const r = await verifyComprobante(adapter, "not-a-cdc");
    expect(asked).toBe(false);
    expect(r.verdict).toBe("rejected");
    expect(r.status).toBeNull();
  });

  it("verifies an approved document and keeps SIFEN's own wording", async () => {
    const r = await verifyComprobante(
      adapterReturning({ estado: "Aprobado", code: "0260", message: "Documento aprobado" }),
      cdcFor()
    );
    expect(r.verdict).toBe("verified");
    expect(r.status?.message).toBe("Documento aprobado");
    expect(r.findings.find((x) => x.code === "sifen_approved")?.values?.message).toBe(
      "Documento aprobado"
    );
  });

  it("rejects a document SIFEN does not report as approved", async () => {
    const r = await verifyComprobante(
      adapterReturning({ estado: "Rechazado", code: "0420", message: "Documento no encontrado" }),
      cdcFor()
    );
    expect(r.verdict).toBe("rejected");
    expect(r.findings.find((x) => x.code === "sifen_not_approved")?.severity).toBe("error");
  });

  it("returns 'unknown' when SIFEN cannot be reached, and says why", async () => {
    const r = await verifyComprobante(adapterFailing("ETIMEDOUT"), cdcFor());
    expect(r.verdict).toBe("unknown");
    expect(r.findings.find((x) => x.code === "sifen_unreachable")?.values?.detail).toContain(
      "ETIMEDOUT"
    );
    expect(r.status).toBeNull();
  });

  it("reports a mismatch even when SIFEN approves the document", async () => {
    const r = await verifyComprobante(adapterReturning({ estado: "Aprobado" }), cdcFor(), {
      supplierRuc: "80000000-0",
    });
    expect(r.verdict).toBe("mismatch");
    expect(codes(r.findings)).toContain("ruc_mismatch");
    // SIFEN was still asked and its answer is still shown — we report, the
    // user decides.
    expect(r.status?.estado).toBe("Aprobado");
  });

  it("normalises the CDC it reports back", async () => {
    const cdc = cdcFor();
    const r = await verifyComprobante(adapterReturning({}), `${cdc.slice(0, 4)} ${cdc.slice(4)}`);
    expect(r.cdc).toBe(cdc);
  });
});

describe("helpers", () => {
  it("converts the CDC date to ISO and refuses nonsense", () => {
    expect(cdcDateToIso("20260514")).toBe("2026-05-14");
    expect(cdcDateToIso("2026051")).toBeNull();
    expect(cdcDateToIso("abcdefgh")).toBeNull();
  });

  it("formats the document number the way the rest of the app writes it", () => {
    expect(cdcFullNumber(parseCdc(cdcFor())!)).toBe("001-001-0000123");
  });
});
