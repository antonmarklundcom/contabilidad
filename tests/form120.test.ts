import { describe, it, expect } from "vitest";
import { computeForm120 } from "@/lib/form120";
import type { LibroTotals } from "@/lib/accounting";

function totals(partial: Partial<LibroTotals>): LibroTotals {
  return {
    gravada10: 0,
    gravada5: 0,
    exenta: 0,
    iva10: 0,
    iva5: 0,
    total: 0,
    ivaDeducible10: 0,
    ivaDeducible5: 0,
    ivaDeducible: 0,
    ...partial,
  };
}

describe("computeForm120", () => {
  it("computes impuesto a pagar when debito exceeds credito", () => {
    const ventas = totals({ iva10: 100000, iva5: 0, total: 1100000 });
    const compras = totals({ iva10: 20000, ivaDeducible10: 20000, ivaDeducible: 20000, total: 220000 });
    const f = computeForm120(2026, 7, ventas, compras, 0, { ventas: 5, compras: 3 });
    expect(f.ventas.debitoFiscal).toBe(100000);
    expect(f.compras.creditoFiscal).toBe(20000);
    expect(f.resultado).toBe(80000);
    expect(f.aPagar).toBe(80000);
    expect(f.saldoAFavor).toBe(0);
  });

  it("computes saldo a favor when credito exceeds debito", () => {
    const ventas = totals({ iva10: 10000 });
    const compras = totals({ iva10: 50000, ivaDeducible10: 50000, ivaDeducible: 50000 });
    const f = computeForm120(2026, 7, ventas, compras, 0, { ventas: 1, compras: 1 });
    expect(f.resultado).toBe(-40000);
    expect(f.aPagar).toBe(0);
    expect(f.saldoAFavor).toBe(40000);
  });

  it("carries the previous period's saldo a favor into the credit side", () => {
    const ventas = totals({ iva10: 50000 });
    const compras = totals({ iva10: 10000, ivaDeducible10: 10000, ivaDeducible: 10000 });
    const f = computeForm120(2026, 7, ventas, compras, 30000, { ventas: 1, compras: 1 });
    // 50000 - 10000 - 30000 = 10000 a pagar
    expect(f.resultado).toBe(10000);
    expect(f.aPagar).toBe(10000);
  });

  it("only counts deducible IVA as crédito fiscal, not raw purchase IVA", () => {
    const ventas = totals({ iva10: 100000 });
    // Header IVA is 100000, but only half is deducible (mixed personal/business receipts).
    const compras = totals({ iva10: 100000, ivaDeducible10: 50000, ivaDeducible: 50000 });
    const f = computeForm120(2026, 7, ventas, compras, 0, { ventas: 1, compras: 1 });
    expect(f.compras.creditoFiscal).toBe(50000);
    expect(f.compras.ivaNoDeducible).toBe(50000);
    expect(f.aPagar).toBe(50000);
  });
});
