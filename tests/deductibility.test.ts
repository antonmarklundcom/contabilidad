import { describe, it, expect } from "vitest";
import { itemIva, computeDeducible, itemsMatchTotal } from "@/lib/deductibility";

describe("itemIva", () => {
  it("extracts 10% IVA from an IVA-included total", () => {
    expect(itemIva(110000, 10, "PYG")).toBe(10000);
  });
  it("extracts 5% IVA from an IVA-included total", () => {
    expect(itemIva(105000, 5, "PYG")).toBe(5000);
  });
  it("is zero for exempt items", () => {
    expect(itemIva(50000, 0, "PYG")).toBe(0);
  });
});

describe("computeDeducible — no items (expense-level percent)", () => {
  it("applies the expense-level percent to header IVA", () => {
    const d = computeDeducible({
      iva10: 10000,
      iva5: 0,
      deduciblePercent: 50,
      moneda: "PYG",
      items: [],
    });
    expect(d.ivaDeducible10).toBe(5000);
    expect(d.ivaDeducible).toBe(5000);
    expect(d.ivaNoDeducible).toBe(5000);
  });

  it("100% deducible by default", () => {
    const d = computeDeducible({
      iva10: 10000,
      iva5: 5000,
      deduciblePercent: 100,
      moneda: "PYG",
      items: [],
    });
    expect(d.ivaDeducible).toBe(15000);
    expect(d.ivaNoDeducible).toBe(0);
  });
});

describe("computeDeducible — with items (per-item percent)", () => {
  it("mixes deducible and non-deducible items on the same receipt", () => {
    // Office supplies (110.000 @ 10%, 100% deducible) + personal groceries (55.000 @ 10%, 0% deducible)
    const d = computeDeducible({
      iva10: 15000, // header IVA from the comprobante (10000 + 5000)
      iva5: 0,
      deduciblePercent: 100,
      moneda: "PYG",
      items: [
        { total: 110000, tasa: 10, deduciblePercent: 100 },
        { total: 55000, tasa: 10, deduciblePercent: 0 },
      ],
    });
    expect(d.ivaDeducible10).toBe(10000);
    expect(d.ivaDeducible).toBe(10000);
    expect(d.ivaNoDeducible).toBe(5000);
  });

  it("caps the deducible amount at the header IVA", () => {
    // Items imply more IVA than the header (bad OCR data) — never exceed the comprobante's IVA.
    const d = computeDeducible({
      iva10: 5000,
      iva5: 0,
      deduciblePercent: 100,
      moneda: "PYG",
      items: [{ total: 220000, tasa: 10, deduciblePercent: 100 }], // implies 20000 IVA
    });
    expect(d.ivaDeducible10).toBe(5000);
  });

  it("handles a mixed-rate receipt with partial deductibility", () => {
    const d = computeDeducible({
      iva10: 10000,
      iva5: 5000,
      deduciblePercent: 100,
      moneda: "PYG",
      items: [
        { total: 110000, tasa: 10, deduciblePercent: 50 }, // IVA 10000 * 0.5 = 5000
        { total: 105000, tasa: 5, deduciblePercent: 100 }, // IVA 5000
      ],
    });
    expect(d.ivaDeducible10).toBe(5000);
    expect(d.ivaDeducible5).toBe(5000);
    expect(d.ivaDeducible).toBe(10000);
  });
});

describe("itemsMatchTotal", () => {
  it("passes when items sum to the total within tolerance", () => {
    expect(
      itemsMatchTotal([{ total: 100000, tasa: 10, deduciblePercent: 100 }], 100000, "PYG")
    ).toBe(true);
  });
  it("fails when items don't add up", () => {
    expect(
      itemsMatchTotal([{ total: 50000, tasa: 10, deduciblePercent: 100 }], 100000, "PYG")
    ).toBe(false);
  });
  it("passes trivially with no items", () => {
    expect(itemsMatchTotal([], 100000, "PYG")).toBe(true);
  });
});
