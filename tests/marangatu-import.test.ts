import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseMarangatuFile } from "@/lib/marangatu-import";

/**
 * Golden-file tests for the Marangatú "consulta de comprobantes" parser.
 *
 * STRATEGY's format-drift mitigation leans on these: the parser matches
 * headers case/accent-insensitively precisely so DNIT can rename a column
 * without breaking the import, and that promise is only worth anything if a
 * fixture proves it. The fixtures under tests/fixtures/marangatu are the
 * shapes the export has been seen in — add a file rather than editing one
 * when a new shape appears.
 */
const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "tests/fixtures/marangatu", name));

describe("parseMarangatuFile — CSV, accented headers", () => {
  const rows = parseMarangatuFile(
    fixture("comprobantes-basico.csv"),
    "comprobantes-basico.csv"
  );

  it("parses every row without errors", () => {
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.error === null)).toBe(true);
  });

  it("reads a 10% invoice, thousand separators and dd/mm/yyyy dates", () => {
    const first = rows[0].data!;
    expect(first.supplierRuc).toBe("80012345");
    expect(first.supplierDv).toBe("0");
    expect(first.supplierRazonSocial).toBe("PROVEEDOR UNO S.A.");
    expect(first.timbrado).toBe("12345678");
    expect(first.numeroComprobante).toBe("001-001-0000123");
    expect(first.fecha?.getFullYear()).toBe(2026);
    expect(first.fecha?.getMonth()).toBe(6); // July
    expect(first.fecha?.getDate()).toBe(15);
    expect(first.gravada10).toBe(1_000_000);
    expect(first.iva10).toBe(100_000);
    expect(first.total).toBe(1_100_000);
    expect(first.moneda).toBe("PYG");
  });

  it("reads a mixed 5% + exenta invoice", () => {
    const second = rows[1].data!;
    expect(second).toMatchObject({
      supplierRuc: "80098765",
      gravada10: 0,
      iva10: 0,
      gravada5: 400_000,
      iva5: 20_000,
      exenta: 50_000,
      total: 470_000,
    });
  });

  it("reports the spreadsheet row number, not the array index", () => {
    expect(rows.map((r) => r.row)).toEqual([2, 3]);
  });
});

describe("parseMarangatuFile — CSV, alternate header names", () => {
  const rows = parseMarangatuFile(
    fixture("comprobantes-variante.csv"),
    "comprobantes-variante.csv"
  );

  it("accepts the aliases and a combined RUC-DV column", () => {
    const first = rows[0].data!;
    expect(first.supplierRuc).toBe("80012345");
    expect(first.supplierDv).toBe("0");
    expect(first.supplierRazonSocial).toBe("PROVEEDOR UNO S.A.");
    expect(first.tipoComprobante).toBe("AUTOFACTURA");
    expect(first.total).toBe(220_000);
    expect(first.moneda).toBe("USD");
  });

  it("reads an ISO date as well as dd/mm/yyyy", () => {
    expect(rows[0].data!.fecha?.toISOString().slice(0, 10)).toBe("2026-07-05");
  });

  it("rejects a RUC whose check digit does not verify, and keeps going", () => {
    const bad = rows.find((r) => r.error === "ruc_invalid");
    expect(bad?.row).toBe(4);
    expect(bad?.data).toBeNull();
  });

  it("rejects a row with no total", () => {
    const noTotal = rows.find((r) => r.error === "missing_total");
    expect(noTotal?.row).toBe(5);
  });

  it("drops fully blank rows instead of reporting them", () => {
    // The blank line between data rows never reaches the results.
    expect(rows.map((r) => r.row)).toEqual([2, 4, 5]);
  });
});

describe("parseMarangatuFile — XLSX", () => {
  it("reads the same values out of the spreadsheet form", () => {
    const rows = parseMarangatuFile(
      fixture("comprobantes-basico.xlsx"),
      "comprobantes-basico.xlsx"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].error).toBeNull();
    expect(rows[0].data).toMatchObject({
      supplierRuc: "80012345",
      supplierDv: "0",
      numeroComprobante: "001-001-0000123",
      gravada10: 1_000_000,
      iva10: 100_000,
      total: 1_100_000,
      moneda: "PYG",
    });
    expect(rows[0].data!.fecha?.toISOString().slice(0, 10)).toBe("2026-07-15");
  });
});

describe("parseMarangatuFile — degenerate input", () => {
  it("returns nothing for an empty file", () => {
    expect(parseMarangatuFile(Buffer.from(""), "vacio.csv")).toEqual([]);
  });

  it("returns nothing for a header-only file", () => {
    const headerOnly = Buffer.from("RUC,DV,Razón Social,Total\n");
    expect(parseMarangatuFile(headerOnly, "solo-encabezado.csv")).toEqual([]);
  });
});
