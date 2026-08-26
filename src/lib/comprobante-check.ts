/**
 * Verifying a RECEIVED comprobante by its CDC (PLAN Phase 5.8, carried from
 * Phase 3.2).
 *
 * "Paste a CDC and find out whether the document is real, approved, and
 * actually the one you were handed." The competitor cannot show this: they
 * read Marangatú after the fact, we ask SIFEN directly through the existing
 * adapter (STRATEGY §"We emit; they observe").
 *
 * ## Local first, network second — deliberately in that order
 *
 * Everything provable without the network is proved without the network: the
 * CDC's length, its módulo-11 check digit, and whether the identity baked
 * into it matches the expense the user says it belongs to. Only then is SIFEN
 * asked. Three reasons, in order of importance:
 *
 *  1. a malformed CDC is a **certain** failure, and a certain answer must not
 *     depend on a network round trip that might time out into a maybe;
 *  2. the CDC carries the issuer's RUC, the document number and the issue
 *     date, so a mismatch against the captured expense is detectable with no
 *     network at all — and that mismatch (a real, approved document that is
 *     simply not the one in front of you) is the case a status query alone
 *     would happily wave through;
 *  3. it keeps junk off SIFEN.
 *
 * The findings list is the output, not a boolean, for the same reason
 * `reconcile.ts` reports findings: the user decides, we show our work.
 *
 * The pure half lives here and is fixture-tested. The one impure function,
 * `verifyComprobante`, is the adapter call wrapped around it.
 */
import { isValidCdcFormat, parseCdc, type CdcParts } from "@/lib/sifen/cdc";
import type { SifenAdapter, SifenStatus } from "@/lib/sifen/types";

/** What a check turned up. Ordered by how much it should worry the user. */
export type CheckSeverity = "error" | "warning" | "info";

export type CheckCode =
  // Local, structural.
  | "cdc_empty"
  | "cdc_bad_length"
  | "cdc_bad_check_digit"
  // Local, cross-checked against the captured expense.
  | "ruc_mismatch"
  | "numero_mismatch"
  | "fecha_mismatch"
  | "tipo_mismatch"
  // From SIFEN.
  | "sifen_approved"
  | "sifen_not_approved"
  | "sifen_unreachable"
  // Positive local findings.
  | "cdc_wellformed"
  | "matches_expense";

export interface CheckFinding {
  code: CheckCode;
  severity: CheckSeverity;
  /** Values the UI interpolates into the message for this code. */
  values?: Record<string, string>;
}

/** The captured document a pasted CDC is claimed to belong to. */
export interface ExpenseFacts {
  supplierRuc?: string | null;
  /** `xxx-xxx-xxxxxxx`, as captured. */
  numeroComprobante?: string | null;
  fecha?: Date | null;
  tipoComprobante?: string | null;
}

export interface LocalCheck {
  findings: CheckFinding[];
  parts: CdcParts | null;
  /** False when the CDC cannot be a CDC — SIFEN is not worth asking. */
  wellFormed: boolean;
}

/** `AAAAMMDD` → `YYYY-MM-DD`, for display and comparison. */
export function cdcDateToIso(fecha: string): string | null {
  if (!/^[0-9]{8}$/.test(fecha)) return null;
  const iso = `${fecha.slice(0, 4)}-${fecha.slice(4, 6)}-${fecha.slice(6, 8)}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : iso;
}

/** The `xxx-xxx-xxxxxxx` number a CDC encodes. */
export function cdcFullNumber(parts: CdcParts): string {
  return `${parts.establecimiento}-${parts.punto}-${parts.numero}`;
}

/** Strips formatting so `001-001-0000123` and `1-1-123` compare equal. */
function normalizeNumero(value: string): string | null {
  const groups = value.trim().split(/[-\s/]+/).filter(Boolean);
  if (groups.length !== 3 || groups.some((g) => !/^[0-9]+$/.test(g))) return null;
  const [est, punto, numero] = groups;
  return `${est.padStart(3, "0")}-${punto.padStart(3, "0")}-${numero.padStart(7, "0")}`;
}

/** Digits only — a captured RUC may or may not carry its DV. */
function rucBody(value: string): string {
  return value.trim().split("-")[0].replace(/\D/g, "");
}

/**
 * Everything decidable without the network.
 *
 * `facts` is optional: a bare CDC still gets its structural verdict, and the
 * cross-checks simply do not run. A missing field on the expense is not a
 * mismatch — it is nothing to compare, and inventing a warning for it would
 * train the user to ignore warnings.
 */
export function checkCdcLocally(rawCdc: string, facts?: ExpenseFacts): LocalCheck {
  const cdc = rawCdc.replace(/[\s-]/g, "");
  const findings: CheckFinding[] = [];

  if (!cdc) {
    return { findings: [{ code: "cdc_empty", severity: "error" }], parts: null, wellFormed: false };
  }
  if (!/^[0-9]{44}$/.test(cdc)) {
    return {
      findings: [
        { code: "cdc_bad_length", severity: "error", values: { length: String(cdc.length) } },
      ],
      parts: null,
      wellFormed: false,
    };
  }
  if (!isValidCdcFormat(cdc)) {
    // The módulo-11 check digit is ours to verify — a typo is caught here,
    // with certainty, and never reaches SIFEN.
    return {
      findings: [{ code: "cdc_bad_check_digit", severity: "error" }],
      parts: parseCdc(cdc),
      wellFormed: false,
    };
  }

  const parts = parseCdc(cdc)!;
  findings.push({
    code: "cdc_wellformed",
    severity: "info",
    values: {
      ruc: `${parts.rucEmisor}-${parts.dvEmisor}`,
      numero: cdcFullNumber(parts),
      fecha: cdcDateToIso(parts.fecha) ?? parts.fecha,
    },
  });

  let compared = 0;
  let mismatched = 0;

  if (facts?.supplierRuc) {
    const captured = rucBody(facts.supplierRuc);
    if (captured) {
      compared++;
      // Compare unpadded: a RUC stored with leading zeros and one without
      // are the same taxpayer.
      if (String(Number(captured)) !== String(Number(parts.rucEmisor))) {
        mismatched++;
        findings.push({
          code: "ruc_mismatch",
          severity: "error",
          values: { captured, cdc: parts.rucEmisor },
        });
      }
    }
  }

  if (facts?.numeroComprobante) {
    const captured = normalizeNumero(facts.numeroComprobante);
    if (captured) {
      compared++;
      if (captured !== cdcFullNumber(parts)) {
        mismatched++;
        findings.push({
          code: "numero_mismatch",
          severity: "error",
          values: { captured, cdc: cdcFullNumber(parts) },
        });
      }
    }
  }

  if (facts?.fecha) {
    const captured = facts.fecha.toISOString().slice(0, 10);
    const fromCdc = cdcDateToIso(parts.fecha);
    if (fromCdc) {
      compared++;
      if (captured !== fromCdc) {
        // A warning, not an error: the CDC carries the DATE OF ISSUE, and a
        // captured expense is sometimes dated by when it was received or
        // paid. Worth showing, not worth calling fraud.
        mismatched++;
        findings.push({
          code: "fecha_mismatch",
          severity: "warning",
          values: { captured, cdc: fromCdc },
        });
      }
    }
  }

  if (compared > 0 && mismatched === 0) {
    findings.push({ code: "matches_expense", severity: "info", values: { checks: String(compared) } });
  }

  return { findings, parts, wellFormed: true };
}

export type Verdict = "verified" | "rejected" | "mismatch" | "unknown";

export interface VerificationResult {
  /** The CDC as checked — digits only. */
  cdc: string;
  verdict: Verdict;
  findings: CheckFinding[];
  parts: CdcParts | null;
  /** SIFEN's own answer, when it was reached. Its message is shown verbatim. */
  status: SifenStatus | null;
}

/**
 * Folds the local findings and SIFEN's answer into one verdict.
 *
 * The precedence is the point:
 *  - a structural error is `rejected` — SIFEN was never asked;
 *  - SIFEN calling the document anything but approved is `rejected`, whatever
 *    else is wrong with it — the strongest statement available;
 *  - a local ERROR-level mismatch outranks an "Aprobado", because a genuine,
 *    approved document that is not the one you were handed is exactly the
 *    case a naive status check waves through;
 *  - SIFEN unreachable is `unknown`, never `verified`. We do not upgrade
 *    "we could not ask" into "it is fine".
 */
export function verdictFor(findings: readonly CheckFinding[]): Verdict {
  const has = (code: CheckCode) => findings.some((f) => f.code === code);

  if (has("cdc_empty") || has("cdc_bad_length") || has("cdc_bad_check_digit")) return "rejected";
  // SIFEN saying the document is not approved is a stronger statement than
  // "it is not the one you were handed", so it is tested BEFORE the sweep
  // below — which would otherwise swallow it, since it is an error too.
  if (has("sifen_not_approved")) return "rejected";
  if (findings.some((f) => f.severity === "error")) return "mismatch";
  if (has("sifen_unreachable")) return "unknown";
  if (has("sifen_approved")) return "verified";
  return "unknown";
}

/**
 * The full check: local first, then the SIFEN consulta through the adapter.
 *
 * The adapter is injected rather than resolved here so the whole flow is
 * testable without a database or a certificate — the same reason
 * `getSifenAdapterForCompany()` exists as a separate call.
 */
export async function verifyComprobante(
  adapter: Pick<SifenAdapter, "queryStatus">,
  rawCdc: string,
  facts?: ExpenseFacts
): Promise<VerificationResult> {
  const cdc = rawCdc.replace(/[\s-]/g, "");
  const local = checkCdcLocally(rawCdc, facts);

  if (!local.wellFormed) {
    // A certain failure must not be made uncertain by a network call.
    return { cdc, verdict: verdictFor(local.findings), findings: local.findings, parts: local.parts, status: null };
  }

  const findings = [...local.findings];
  let status: SifenStatus | null = null;
  try {
    status = await adapter.queryStatus(cdc);
    const approved = /aprobad/i.test(status.estado ?? "");
    findings.push({
      code: approved ? "sifen_approved" : "sifen_not_approved",
      severity: approved ? "info" : "error",
      values: {
        estado: status.estado ?? "",
        code: status.code ?? "",
        // SIFEN's own wording, verbatim — our dictionary explains, it never
        // replaces (see sifen/errors.ts).
        message: status.message ?? "",
      },
    });
  } catch (err) {
    findings.push({
      code: "sifen_unreachable",
      severity: "warning",
      values: { detail: String((err as Error).message ?? err) },
    });
  }

  return { cdc, verdict: verdictFor(findings), findings, parts: local.parts, status };
}
