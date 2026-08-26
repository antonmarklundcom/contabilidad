/**
 * e-Kuatiá DE XML import (PLAN Phase 3.1, carried forward).
 *
 * Taxpayers can download the electronic documents issued TO them, as the
 * SIFEN XML itself. That XML is the authoritative record — better than a
 * spreadsheet export (`marangatu-import.ts`, which carries no CDC) and far
 * better than a photograph — so importing it is the highest-fidelity way a
 * received comprobante can enter the books.
 *
 * ## What this parses, and how the vocabulary was fixed
 *
 * The element names are not invented and not read off a blog: they are the
 * ones OUR OWN `xmlgen` output uses, because we emit the same document type
 * we are reading here. `tests/fixtures/ekuatia/` holds XML produced by the
 * real library, so the parser is tested against the generator rather than
 * against a hand-typed idea of the format — the same discipline as
 * `tests/fixtures/marangatu/`.
 *
 * Three shapes are accepted, because all three are what people actually have
 * on disk: a bare `<rDE>`, a signed `<rDE>` with a `<Signature>` sibling, and
 * a DE wrapped in a batch or response envelope. The `<DE>` element is located
 * by name wherever it sits rather than by a fixed path.
 *
 * ## What it refuses
 *
 * The CDC is validated with our own `cdc.ts` (módulo 11), and then the
 * identity it encodes is cross-checked against the document body via
 * `comprobante-check.ts` — the same code the paste-a-CDC flow uses. An XML
 * whose CDC disagrees with its own `dRucEm`/`dNumDoc`/`dFeEmiDE` is not a
 * document we will book: it is either corrupted or edited, and either way a
 * human should look at it before it becomes a tax figure.
 *
 * Note this reads the DE, it does NOT verify the signature. A signature check
 * needs SIFEN's certificate chain; the honest verification of "is this real
 * and approved" is the consulta in `comprobante-check.ts`, which asks SIFEN.
 */
import { parseStringPromise } from "xml2js";
import { isValidCdcFormat, parseCdc, type CdcParts } from "@/lib/sifen/cdc";
import { checkCdcLocally, type CheckFinding } from "@/lib/comprobante-check";
import { validarRuc } from "@/lib/sifen/ruc";

export interface DeItem {
  descripcion: string;
  cantidad: number | null;
  /** IVA-included line total, the SIFEN convention `deductibility.ts` expects. */
  total: number;
  /** 10 | 5 | 0 (0 = exenta). */
  tasa: number;
}

/** One received document, in the shape the Expense import needs. */
export interface ParsedDe {
  cdc: string;
  tipoDocumento: number;
  tipoComprobante: string;
  supplierRuc: string;
  supplierDv: string;
  supplierRazonSocial: string;
  /** RUC the document was issued TO — used to refuse someone else's document. */
  receptorRuc: string | null;
  timbrado: string | null;
  numeroComprobante: string;
  fecha: Date;
  gravada10: number;
  gravada5: number;
  exenta: number;
  iva10: number;
  iva5: number;
  total: number;
  moneda: string;
  items: DeItem[];
}

export type DeParseError =
  | "not_xml"
  | "no_de"
  | "no_cdc"
  | "cdc_invalid"
  | "cdc_mismatch"
  | "missing_fields";

export interface DeParseResult {
  ok: boolean;
  de: ParsedDe | null;
  error: DeParseError | null;
  /** Populated for `cdc_mismatch` so the UI can say exactly what disagreed. */
  findings: CheckFinding[];
  parts: CdcParts | null;
}

/* ── xml2js plumbing ─────────────────────────────────────────────────────── */

type Node = Record<string, unknown>;

/** First descendant with this tag name, anywhere in the tree. */
function findNode(root: unknown, tag: string): Node | null {
  if (root === null || typeof root !== "object") return null;
  if (Array.isArray(root)) {
    for (const child of root) {
      const hit = findNode(child, tag);
      if (hit) return hit;
    }
    return null;
  }
  const obj = root as Node;
  for (const [key, value] of Object.entries(obj)) {
    // Namespace prefixes are stripped by the parser options, but be tolerant.
    if (key === tag || key.endsWith(`:${tag}`)) {
      const node = Array.isArray(value) ? value[0] : value;
      if (node && typeof node === "object") return node as Node;
      // A scalar element still counts as found — wrap it.
      if (node !== undefined) return { _: node } as Node;
    }
    const hit = findNode(value, tag);
    if (hit) return hit;
  }
  return null;
}

/** Every descendant with this tag name, in document order. */
function findAll(root: unknown, tag: string, out: Node[] = []): Node[] {
  if (root === null || typeof root !== "object") return out;
  if (Array.isArray(root)) {
    for (const child of root) findAll(child, tag, out);
    return out;
  }
  for (const [key, value] of Object.entries(root as Node)) {
    if (key === tag || key.endsWith(`:${tag}`)) {
      for (const node of Array.isArray(value) ? value : [value]) {
        if (node && typeof node === "object") out.push(node as Node);
      }
    }
    findAll(value, tag, out);
  }
  return out;
}

/** Text of the first descendant `tag`, trimmed; null when absent or empty. */
function text(root: unknown, tag: string): string | null {
  const node = findNode(root, tag);
  if (!node) return null;
  const raw = node._ ?? (Object.keys(node).length === 0 ? "" : undefined);
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed === "" ? null : trimmed;
  }
  return null;
}

/** A numeric element, defaulting to 0 — absent totals mean zero, not invalid. */
function num(root: unknown, tag: string): number {
  const value = text(root, tag);
  if (value === null) return 0;
  const parsed = Number(value.replace(/\s/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * `dFeEmiDE` is an ISO local datetime (`2026-08-26T10:17:54`) with no zone.
 * It is read as the CALENDAR DAY it names, at UTC midnight, because that is
 * the day the document belongs to for the libro — never shifted by the
 * server's timezone.
 */
export function parseDeDate(value: string | null): Date | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ── the parser ──────────────────────────────────────────────────────────── */

/** Maps SIFEN's `iTiDE` to the label the rest of the app writes. */
const TIPO_LABEL: Record<number, string> = {
  1: "FACTURA",
  4: "AUTOFACTURA",
  5: "NOTA DE CREDITO",
  6: "NOTA DE DEBITO",
  7: "NOTA DE REMISION",
};

export async function parseDeXml(xml: string): Promise<DeParseResult> {
  const fail = (error: DeParseError, extra: Partial<DeParseResult> = {}): DeParseResult => ({
    ok: false,
    de: null,
    error,
    findings: [],
    parts: null,
    ...extra,
  });

  let tree: unknown;
  try {
    tree = await parseStringPromise(xml, {
      explicitArray: true,
      // Drop namespace prefixes so `ns:DE` and `DE` read alike.
      tagNameProcessors: [(name: string) => name.replace(/^.*:/, "")],
      attrNameProcessors: [(name: string) => name.replace(/^.*:/, "")],
      trim: true,
    });
  } catch {
    return fail("not_xml");
  }

  const de = findNode(tree, "DE");
  if (!de) return fail("no_de");

  // The CDC is the DE's `Id` attribute — the document's own identity.
  const attrs = (de.$ ?? {}) as Record<string, string>;
  const cdc = String(attrs.Id ?? attrs.id ?? "").replace(/\s/g, "");
  if (!cdc) return fail("no_cdc");
  if (!isValidCdcFormat(cdc)) return fail("cdc_invalid", { parts: parseCdc(cdc) });

  const timb = findNode(de, "gTimb");
  const emis = findNode(de, "gEmis");
  const rec = findNode(de, "gDatRec");
  const totals = findNode(de, "gTotSub");

  const supplierRuc = text(emis, "dRucEm");
  const supplierDv = text(emis, "dDVEmi");
  const est = text(timb, "dEst");
  const punto = text(timb, "dPunExp");
  const numero = text(timb, "dNumDoc");
  const fecha = parseDeDate(text(de, "dFeEmiDE"));

  if (!supplierRuc || !supplierDv || !est || !punto || !numero || !fecha || !totals) {
    return fail("missing_fields", { parts: parseCdc(cdc) });
  }

  const numeroComprobante = `${est}-${punto}-${numero}`;

  // The CDC encodes the issuer, the number and the date. If the body
  // disagrees with the identity baked into the CDC, the file is corrupted or
  // edited — reuse the paste-a-CDC checker rather than a second copy of the
  // comparison logic.
  const cross = checkCdcLocally(cdc, {
    supplierRuc: `${supplierRuc}-${supplierDv}`,
    numeroComprobante,
    fecha,
  });
  if (cross.findings.some((f) => f.severity === "error")) {
    return fail("cdc_mismatch", { findings: cross.findings, parts: cross.parts });
  }

  const tipoDocumento = Number(text(timb, "iTiDE") ?? "1") || 1;

  const items: DeItem[] = findAll(de, "gCamItem").map((item) => {
    const iva = findNode(item, "gCamIVA");
    const tasa = Number(text(iva, "dTasaIVA") ?? "0") || 0;
    const cantidad = Number(text(item, "dCantProSer") ?? "");
    return {
      descripcion: text(item, "dDesProSer") ?? "",
      cantidad: Number.isFinite(cantidad) ? cantidad : null,
      // `dTotOpeItem` is the IVA-INCLUDED line total, which is exactly what
      // ExpenseItem and deductibility.ts expect.
      total: num(item, "dTotOpeItem"),
      tasa,
    };
  });

  return {
    ok: true,
    error: null,
    findings: cross.findings,
    parts: cross.parts,
    de: {
      cdc,
      tipoDocumento,
      tipoComprobante: TIPO_LABEL[tipoDocumento] ?? text(timb, "dDesTiDE") ?? "FACTURA",
      supplierRuc,
      supplierDv,
      supplierRazonSocial: text(emis, "dNomEmi") ?? "",
      receptorRuc: text(rec, "dRucRec"),
      timbrado: text(timb, "dNumTim"),
      numeroComprobante,
      fecha,
      // The gTotSub block is the emitter's own arithmetic and is what the
      // libro must agree with — never recomputed from the items here.
      gravada10: num(totals, "dBaseGrav10"),
      gravada5: num(totals, "dBaseGrav5"),
      exenta: num(totals, "dSubExe") + num(totals, "dSubExo"),
      iva10: num(totals, "dIVA10"),
      iva5: num(totals, "dIVA5"),
      total: num(totals, "dTotGralOpe") || num(totals, "dTotOpe"),
      moneda: text(de, "cMoneOpe") ?? "PYG",
      items,
    },
  };
}

/**
 * Whether a parsed DE was issued to `companyRuc`.
 *
 * Booking someone else's purchase as your own IVA credit is the mistake this
 * exists to prevent — a batch of downloaded XML is easy to mix up. Returns
 * true when the document names no receptor RUC (a consumidor final sale), so
 * the check refuses the *wrong* RUC rather than everything without one.
 */
export function isIssuedTo(de: ParsedDe, companyRuc: string): boolean {
  if (!de.receptorRuc) return true;
  const ours = companyRuc.trim().split("-")[0].replace(/\D/g, "");
  if (!ours) return true;
  return String(Number(ours)) === String(Number(de.receptorRuc));
}

/** Sanity check on an emitter RUC before it becomes a supplier record. */
export function supplierRucIsValid(de: ParsedDe): boolean {
  return validarRuc(de.supplierRuc, de.supplierDv);
}
