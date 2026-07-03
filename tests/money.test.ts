import { describe, it, expect } from "vitest";
import { computeInvoiceTotals, computeLineAmounts, roundMoney } from "@/lib/money";

describe("money rounding", () => {
  it("PYG has no decimals", () => {
    expect(roundMoney(1234.7, "PYG")).toBe(1235);
    expect(roundMoney(1234.2, "PYG")).toBe(1234);
  });
  it("USD keeps 2 decimals", () => {
    expect(roundMoney(12.345, "USD")).toBe(12.35);
    expect(roundMoney(12.344, "USD")).toBe(12.34);
  });
});

describe("IVA extraction (IVA-included prices, PYG)", () => {
  it("extracts 10% IVA from an included price", () => {
    // 110.000 incluido → base 100.000, IVA 10.000
    const a = computeLineAmounts({ cantidad: 1, precioUnitario: 110000, iva: 10 }, "PYG");
    expect(a.lineTotal).toBe(110000);
    expect(a.iva).toBe(10000);
    expect(a.gravada).toBe(100000);
    expect(a.exenta).toBe(0);
  });

  it("extracts 5% IVA from an included price", () => {
    // 105.000 incluido → base 100.000, IVA 5.000
    const a = computeLineAmounts({ cantidad: 1, precioUnitario: 105000, iva: 5 }, "PYG");
    expect(a.iva).toBe(5000);
    expect(a.gravada).toBe(100000);
  });

  it("treats exempt lines as fully exenta with no IVA", () => {
    const a = computeLineAmounts({ cantidad: 2, precioUnitario: 50000, iva: 0 }, "PYG");
    expect(a.lineTotal).toBe(100000);
    expect(a.iva).toBe(0);
    expect(a.exenta).toBe(100000);
    expect(a.gravada).toBe(0);
  });

  it("applies per-unit discount before tax extraction", () => {
    const a = computeLineAmounts(
      { cantidad: 2, precioUnitario: 110000, descuento: 10000, iva: 10 },
      "PYG"
    );
    // (110000-10000)*2 = 200000 incluido
    expect(a.lineTotal).toBe(200000);
  });
});

describe("invoice totals", () => {
  it("sums a mixed 10% / 5% / exempt invoice and closes gravada+iva+exenta = total", () => {
    const totals = computeInvoiceTotals(
      [
        { cantidad: 1, precioUnitario: 110000, iva: 10 },
        { cantidad: 1, precioUnitario: 105000, iva: 5 },
        { cantidad: 1, precioUnitario: 50000, iva: 0 },
      ],
      "PYG"
    );
    expect(totals.iva10).toBe(10000);
    expect(totals.iva5).toBe(5000);
    expect(totals.totalIva).toBe(15000);
    expect(totals.exenta).toBe(50000);
    expect(totals.total).toBe(265000);
    // The accounting identity that SIFEN validates.
    expect(totals.gravada10 + totals.iva10 + totals.gravada5 + totals.iva5 + totals.exenta).toBe(
      totals.total
    );
  });

  it("scales with quantity", () => {
    const totals = computeInvoiceTotals(
      [{ cantidad: 3, precioUnitario: 110000, iva: 10 }],
      "PYG"
    );
    expect(totals.total).toBe(330000);
    expect(totals.iva10).toBe(30000);
  });
});
