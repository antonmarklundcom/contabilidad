/**
 * Import of "Consulta de comprobantes" exports from Marangatu (electronic
 * AND virtual/manual comprobantes that DNIT already has on file for this
 * RUC as buyer). Bulk-loads received documents as Expenses without
 * requiring OCR — the numbers are already structured in the export.
 *
 * Marangatu's own export column names vary by report and over time, so
 * this reads by flexible header matching (case/accent-insensitive,
 * ignores spacing) rather than a fixed column order. Unmapped columns are
 * ignored; unmapped required columns produce a per-row error.
 */
import * as XLSX from "xlsx";
import { validarRuc } from "@/lib/sifen/ruc";

export interface MarangatuRow {
  supplierRuc: string | null;
  supplierDv: string | null;
  supplierRazonSocial: string | null;
  timbrado: string | null;
  tipoComprobante: string | null;
  numeroComprobante: string | null;
  fecha: Date | null;
  gravada10: number;
  gravada5: number;
  exenta: number;
  iva10: number;
  iva5: number;
  total: number;
  moneda: "PYG" | "USD";
}

export interface ParsedRow {
  row: number;
  data: MarangatuRow | null;
  error: string | null;
}

function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Each field maps to a list of accepted (normalized) header aliases.
const COLUMN_ALIASES: Record<keyof MarangatuRow | "rucCompleto", string[]> = {
  supplierRuc: ["ruc", "rucemisor", "rucproveedor"],
  supplierDv: ["dv", "dvemisor", "digitoverificador"],
  rucCompleto: ["rucdv", "rucconvd"],
  supplierRazonSocial: ["razonsocial", "nombreoemisor", "nombreemisor", "proveedor", "denominacion"],
  timbrado: ["timbrado", "nrotimbrado", "numerotimbrado"],
  tipoComprobante: ["tipocomprobante", "tipodocumento", "tipodedocumento"],
  numeroComprobante: ["nrocomprobante", "numerocomprobante", "nrodocumento", "numero"],
  fecha: ["fechaemision", "fecha"],
  gravada10: ["gravada10", "baseimponible10", "gravadas10"],
  gravada5: ["gravada5", "baseimponible5", "gravadas5"],
  exenta: ["exenta", "exentas", "montoexento"],
  iva10: ["iva10", "liquidacioniva10"],
  iva5: ["iva5", "liquidacioniva5"],
  total: ["total", "totaloperacion", "montototal"],
  moneda: ["moneda"],
};

function buildColumnMap(headers: string[]): Partial<Record<keyof MarangatuRow, number>> {
  const normalized = headers.map(normalizeHeader);
  const map: Partial<Record<keyof MarangatuRow, number>> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [
    keyof MarangatuRow | "rucCompleto",
    string[],
  ][]) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx === -1) continue;
    if (field === "rucCompleto") {
      // "12345678-9" style single column — split later if needed.
      map.supplierRuc = map.supplierRuc ?? idx;
    } else {
      map[field] = idx;
    }
  }
  return map;
}

function parseNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (!v) return 0;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Excel serial date.
    const parsed = XLSX.SSF.parse_date_code(v);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  if (typeof v === "string") {
    const s = v.trim();
    const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function splitRucDv(raw: string): [string, string | null] {
  const m = raw.match(/^(\d{1,8})-?(\d)?$/);
  if (m) return [m[1], m[2] ?? null];
  return [raw.replace(/\D/g, ""), null];
}

/** Parses a Marangatu comprobantes export (CSV or XLSX) into normalized rows. */
export function parseMarangatuFile(buffer: Buffer, filename: string): ParsedRow[] {
  const isCsv = filename.toLowerCase().endsWith(".csv");
  const wb = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: isCsv ? false : true });
  if (rows.length === 0) return [];

  const headers = (rows[0] as unknown[]).map((h) => String(h ?? ""));
  const colMap = buildColumnMap(headers);
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c !== undefined && c !== ""));

  const results: ParsedRow[] = [];
  dataRows.forEach((r, i) => {
    const get = (field: keyof MarangatuRow) =>
      colMap[field] !== undefined ? r[colMap[field]!] : undefined;

    const rucRaw = String(get("supplierRuc") ?? "").trim();
    if (!rucRaw && !get("supplierRazonSocial")) {
      results.push({ row: i + 2, data: null, error: "empty_row" });
      return;
    }
    let ruc: string | null = null;
    let dv: string | null = null;
    if (rucRaw) {
      [ruc, dv] = splitRucDv(rucRaw);
      const dvColumn = get("supplierDv");
      if (dvColumn) dv = String(dvColumn).trim();
      if (dv && ruc && !validarRuc(ruc, dv)) {
        results.push({ row: i + 2, data: null, error: "ruc_invalid" });
        return;
      }
    }

    const total = parseNumber(get("total"));
    const fecha = parseDate(get("fecha"));
    if (total <= 0) {
      results.push({ row: i + 2, data: null, error: "missing_total" });
      return;
    }

    results.push({
      row: i + 2,
      error: null,
      data: {
        supplierRuc: ruc,
        supplierDv: dv,
        supplierRazonSocial: get("supplierRazonSocial") ? String(get("supplierRazonSocial")).trim() : null,
        timbrado: get("timbrado") ? String(get("timbrado")).trim() : null,
        tipoComprobante: get("tipoComprobante") ? String(get("tipoComprobante")).trim() : "FACTURA",
        numeroComprobante: get("numeroComprobante") ? String(get("numeroComprobante")).trim() : null,
        fecha,
        gravada10: parseNumber(get("gravada10")),
        gravada5: parseNumber(get("gravada5")),
        exenta: parseNumber(get("exenta")),
        iva10: parseNumber(get("iva10")),
        iva5: parseNumber(get("iva5")),
        total,
        moneda: String(get("moneda") ?? "PYG").toUpperCase().includes("USD") ? "USD" : "PYG",
      },
    });
  });

  return results;
}
