import { describe, it, expect } from "vitest";
import {
  IRP_REGIMES,
  applyBrackets,
  bracketTax,
  computeIrp,
  deducibleFraction,
  addLibroTotals,
  emptyLibroTotals,
  isIrpRegime,
  type IrpBracket,
} from "@/lib/irp";
import type { LibroTotals } from "@/lib/accounting";

/**
 * IRP annual math (PLAN Phase 7).
 *
 * Money-path fixtures, same treatment as form120.test.ts and
 * deductibility.test.ts. Everything here is hand-computed: if a rate or a
 * threshold ever moves in IRP_REGIMES, these break loudly rather than
 * quietly agreeing with the new number.
 *
 * ⚠️ The rates these fixtures assert are corroborated from secondary sources
 * only — see the banner in src/lib/irp.ts. They pin the behaviour of the
 * engine against the table; they are not evidence the table is right.
 */

const RSP = IRP_REGIMES.RSP.brackets;

/** LibroTotals with only the fields a case cares about. */
function libro(partial: Partial<LibroTotals>): LibroTotals {
  return { ...emptyLibroTotals(), ...partial };
}

/** Sales worth `renta` guaraníes of income, all at the 10% rate. */
function ventasFor(renta: number): LibroTotals {
  const iva = Math.round(renta * 0.1);
  return libro({ gravada10: renta, iva10: iva, total: renta + iva });
}

describe("applyBrackets — the progressive engine", () => {
  it("taxes nothing at or below zero", () => {
    expect(applyBrackets(RSP, 0)).toEqual([]);
    expect(applyBrackets(RSP, -1)).toEqual([]);
    expect(bracketTax(RSP, 0)).toBe(0);
  });

  it("stays inside the first tranche below its ceiling", () => {
    // 10.000.000 × 8% = 800.000
    const slices = applyBrackets(RSP, 10_000_000);
    expect(slices).toHaveLength(1);
    expect(slices[0]).toMatchObject({ from: 0, to: 50_000_000, rate: 0.08, base: 10_000_000 });
    expect(bracketTax(RSP, 10_000_000)).toBe(800_000);
  });

  it("taxes the tranche boundary itself at the lower rate", () => {
    // Exactly 50.000.000 is still wholly inside the 8% tranche.
    expect(applyBrackets(RSP, 50_000_000)).toHaveLength(1);
    expect(bracketTax(RSP, 50_000_000)).toBe(4_000_000);
  });

  it("splits across two tranches — not a cliff", () => {
    // 50.000.000 × 8% = 4.000.000; 50.000.000 × 9% = 4.500.000 → 8.500.000
    const slices = applyBrackets(RSP, 100_000_000);
    expect(slices).toHaveLength(2);
    expect(slices[0]).toMatchObject({ rate: 0.08, base: 50_000_000, tax: 4_000_000 });
    expect(slices[1]).toMatchObject({
      from: 50_000_000,
      to: 150_000_000,
      rate: 0.09,
      base: 50_000_000,
      tax: 4_500_000,
    });
    expect(bracketTax(RSP, 100_000_000)).toBe(8_500_000);
  });

  it("reaches the unbounded top tranche", () => {
    // 4.000.000 + 9.000.000 + (50.000.000 × 10% = 5.000.000) = 18.000.000
    const slices = applyBrackets(RSP, 200_000_000);
    expect(slices).toHaveLength(3);
    expect(slices[2]).toMatchObject({ from: 150_000_000, to: null, rate: 0.1, base: 50_000_000 });
    expect(bracketTax(RSP, 200_000_000)).toBe(18_000_000);
  });

  it("one more guaraní over a boundary costs only the higher rate on that guaraní", () => {
    // The whole point of a progressive scale: no jump at the threshold.
    const at = bracketTax(RSP, 50_000_000);
    const justOver = bracketTax(RSP, 50_000_010);
    expect(justOver - at).toBe(1); // 10 × 9% = 0,9 → rounds to 1
  });

  it("always sums to the tax, with no fractional guaraní left over", () => {
    for (const base of [1, 999, 49_999_999, 50_000_001, 149_999_999, 333_333_333]) {
      const slices = applyBrackets(RSP, base);
      expect(bracketTax(RSP, base)).toBe(slices.reduce((s, x) => s + x.tax, 0));
      expect(Number.isInteger(bracketTax(RSP, base))).toBe(true);
    }
  });

  it("is genuinely parameterized — a different table gives a different answer", () => {
    // Not RSP's numbers: proof the engine reads the table rather than knowing
    // the rates, which is what makes the regime question a one-line change.
    const other: IrpBracket[] = [
      { upTo: 1_000_000, rate: 0.5 },
      { upTo: null, rate: 0 },
    ];
    expect(bracketTax(other, 5_000_000)).toBe(500_000);
    expect(bracketTax(IRP_REGIMES.RGC.brackets, 5_000_000)).toBe(400_000); // flat 8%
  });
});

describe("deducibleFraction", () => {
  it("reads the aggregate Phase 2 decision out of the credited IVA", () => {
    expect(deducibleFraction(1_000_000, 1_000_000)).toBe(1);
    expect(deducibleFraction(1_000_000, 500_000)).toBe(0.5);
    expect(deducibleFraction(1_000_000, 0)).toBe(0);
  });

  it("treats 'no IVA at this rate' as no reduction rather than a divide by zero", () => {
    expect(deducibleFraction(0, 0)).toBe(1);
    expect(deducibleFraction(-1, 0)).toBe(1);
  });

  it("never returns a fraction outside 0..1", () => {
    expect(deducibleFraction(100, 250)).toBe(1);
    expect(deducibleFraction(100, -50)).toBe(0);
  });
});

describe("computeIrp — RSP", () => {
  it("derives renta bruta from the IVA-exclusive bases, never from the invoiced total", () => {
    // 200.000.000 of income invoiced with 10% IVA is 220.000.000 collected.
    // The 20.000.000 of IVA belongs to the State and is not income.
    const data = computeIrp(2026, "RSP", ventasFor(200_000_000), emptyLibroTotals(), {
      ventas: 12,
      compras: 0,
    });
    expect(data.ingresos.rentaBruta).toBe(200_000_000);
    expect(data.ingresos.ivaFacturado).toBe(20_000_000);
    expect(data.ingresos.totalFacturado).toBe(220_000_000);
  });

  it("subtracts the deducible share of costs and taxes the remainder", () => {
    // Income 200.000.000. Costs: 40.000.000 base at 10% with HALF the IVA
    // credited, plus 10.000.000 exempt.
    const compras = libro({
      gravada10: 40_000_000,
      iva10: 4_000_000,
      ivaDeducible10: 2_000_000,
      exenta: 10_000_000,
      total: 54_000_000,
    });
    const data = computeIrp(2026, "RSP", ventasFor(200_000_000), compras, {
      ventas: 12,
      compras: 8,
    });

    expect(data.egresos.fraccionDeducible10).toBe(0.5);
    expect(data.egresos.deducible10).toBe(20_000_000);
    expect(data.egresos.deducibleExentas).toBe(10_000_000);
    expect(data.egresos.egresoDeducible).toBe(30_000_000);
    // The excluded half of the 10% base is shown, not dropped.
    expect(data.egresos.egresoNoDeducible).toBe(20_000_000);
    expect(data.egresos.ivaNoDeducible).toBe(2_000_000);

    expect(data.rentaNetaImponible).toBe(170_000_000);
    // 50M×8% + 100M×9% + 20M×10% = 4.000.000 + 9.000.000 + 2.000.000
    expect(data.impuesto).toBe(15_000_000);
    expect(data.bracketBreakdown).toHaveLength(3);
  });

  it("floors the taxable base at zero when costs exceed income", () => {
    const compras = libro({ gravada10: 90_000_000, iva10: 9_000_000, ivaDeducible10: 9_000_000 });
    const data = computeIrp(2026, "RSP", ventasFor(90_000_000), compras, {
      ventas: 4,
      compras: 9,
    });
    // Gross income is over the threshold, so the taxpayer IS incidido —
    // they simply owe nothing this year.
    expect(data.noIncidido).toBe(false);
    expect(data.rentaNetaImponible).toBe(0);
    expect(data.impuesto).toBe(0);
    expect(data.bracketBreakdown).toEqual([]);
  });

  it("owes nothing at or below the incidence threshold, and something just above it", () => {
    const threshold = IRP_REGIMES.RSP.incidenceThreshold!;

    const below = computeIrp(2026, "RSP", ventasFor(threshold), emptyLibroTotals(), {
      ventas: 3,
      compras: 0,
    });
    expect(below.noIncidido).toBe(true);
    expect(below.impuesto).toBe(0);
    // The base is still computed and shown — the obligation is formal, and
    // hiding the figure would make the draft unreviewable.
    expect(below.rentaNetaImponible).toBe(threshold);
    expect(below.bracketBreakdown).toEqual([]);

    const above = computeIrp(2026, "RSP", ventasFor(threshold + 1_000_000), emptyLibroTotals(), {
      ventas: 3,
      compras: 0,
    });
    expect(above.noIncidido).toBe(false);
    // 50M×8% + 31M×9% = 4.000.000 + 2.790.000
    expect(above.impuesto).toBe(6_790_000);
  });

  it("measures incidence on gross income, not on the base after deductions", () => {
    // Gross 120.000.000 is over the threshold; deductions bring the base
    // under it. The taxpayer is still incidido.
    const compras = libro({ gravada10: 60_000_000, iva10: 6_000_000, ivaDeducible10: 6_000_000 });
    const data = computeIrp(2026, "RSP", ventasFor(120_000_000), compras, {
      ventas: 6,
      compras: 6,
    });
    expect(data.ingresos.rentaBruta).toBe(120_000_000);
    expect(data.noIncidido).toBe(false);
    expect(data.rentaNetaImponible).toBe(60_000_000);
    expect(data.impuesto).toBe(4_900_000); // 50M×8% + 10M×9%
  });

  it("carries the scale it used into the snapshot", () => {
    const data = computeIrp(2026, "RSP", ventasFor(100_000_000), emptyLibroTotals(), {
      ventas: 1,
      compras: 0,
    });
    expect(data.regime).toBe("RSP");
    expect(data.rules.brackets).toEqual(IRP_REGIMES.RSP.brackets);
    expect(data.rules.status).toBe("ready");
  });
});

describe("computeIrp — RGC (declared stub)", () => {
  it("is flagged as a stub so the close flow can refuse it", () => {
    expect(IRP_REGIMES.RGC.status).toBe("stub");
    expect(IRP_REGIMES.RSP.status).toBe("ready");
  });

  it("does not deduct expenses, and taxes the gross at the flat rate", () => {
    const compras = libro({ gravada10: 50_000_000, iva10: 5_000_000, ivaDeducible10: 5_000_000 });
    const data = computeIrp(2026, "RGC", ventasFor(200_000_000), compras, {
      ventas: 2,
      compras: 3,
    });
    // Costs are still reported — the user can see what was ignored — but the
    // base is the gross.
    expect(data.egresos.egresoDeducible).toBe(50_000_000);
    expect(data.rentaNetaImponible).toBe(200_000_000);
    expect(data.impuesto).toBe(16_000_000); // flat 8%
    expect(data.bracketBreakdown).toHaveLength(1);
  });

  it("has no incidence threshold", () => {
    const data = computeIrp(2026, "RGC", ventasFor(1_000_000), emptyLibroTotals(), {
      ventas: 1,
      compras: 0,
    });
    expect(data.noIncidido).toBe(false);
    expect(data.impuesto).toBe(80_000);
  });
});

describe("addLibroTotals — folding twelve months into a year", () => {
  it("sums every field, so the annual figure is the sum of the monthly ones", () => {
    const january = libro({
      gravada10: 1_000_000,
      gravada5: 500_000,
      exenta: 100_000,
      iva10: 100_000,
      iva5: 25_000,
      total: 1_725_000,
      ivaDeducible10: 60_000,
      ivaDeducible5: 25_000,
      ivaDeducible: 85_000,
    });
    const year = [january, january, january].reduce(addLibroTotals, emptyLibroTotals());
    expect(year.gravada10).toBe(3_000_000);
    expect(year.gravada5).toBe(1_500_000);
    expect(year.exenta).toBe(300_000);
    expect(year.iva10).toBe(300_000);
    expect(year.iva5).toBe(75_000);
    expect(year.total).toBe(5_175_000);
    expect(year.ivaDeducible10).toBe(180_000);
    expect(year.ivaDeducible5).toBe(75_000);
    expect(year.ivaDeducible).toBe(255_000);
  });

  it("starts from an all-zero identity", () => {
    const empty = emptyLibroTotals();
    expect(Object.values(empty).every((v) => v === 0)).toBe(true);
    expect(addLibroTotals(empty, empty)).toEqual(empty);
  });
});

describe("isIrpRegime", () => {
  it("accepts the two regimes and nothing else", () => {
    expect(isIrpRegime("RSP")).toBe(true);
    expect(isIrpRegime("RGC")).toBe(true);
    for (const bad of ["", "rsp", "IRE", "IVA", null, undefined, 8, {}]) {
      expect(isIrpRegime(bad)).toBe(false);
    }
  });
});
