/**
 * IVA-credit deductibility — item by item.
 *
 * Paraguayan IVA law (Ley 6380/19, art. 88–90) only lets a taxpayer credit
 * the IVA of purchases affected to their taxed activity. Deductibility is
 * decided per line item: a supermarket ticket can mix office supplies
 * (100% deducible) with personal groceries (0%). Each ExpenseItem carries
 * `deduciblePercent`; expenses without items fall back to the expense-level
 * `deduciblePercent`.
 *
 * All amounts follow the SIFEN convention: item totals are IVA-INCLUDED.
 * PYG has no decimals. These are pure functions — tests in
 * tests/deductibility.test.ts protect the math.
 */
import { roundMoney } from "@/lib/money";

export interface DeductibleItemInput {
  /** IVA-included line total. */
  total: number;
  /** 10 | 5 | 0 (0 = exenta). */
  tasa: number;
  /** 0..100 — percentage of this item's IVA that is creditable. */
  deduciblePercent: number;
}

export interface ExpenseLike {
  iva10: number;
  iva5: number;
  deduciblePercent: number;
  moneda: string;
  items: DeductibleItemInput[];
}

/** IVA contained in an IVA-included total at the given rate. */
export function itemIva(total: number, tasa: number, currency: string): number {
  if (tasa === 10) return roundMoney(total - total / 1.1, currency);
  if (tasa === 5) return roundMoney(total - total / 1.05, currency);
  return 0;
}

export interface DeducibleTotals {
  /** Creditable IVA at 10% / 5% (crédito fiscal). */
  ivaDeducible10: number;
  ivaDeducible5: number;
  ivaDeducible: number;
  /** IVA that is NOT creditable (goes to cost, not to the F120 credit). */
  ivaNoDeducible: number;
}

/**
 * Deducible IVA for one expense.
 *
 * With items, the deducible amount is derived item by item and CAPPED at the
 * header iva10/iva5 (the header, taken from the comprobante, is authoritative
 * for the libro — items only drive the deducible fraction). Without items,
 * the expense-level percentage applies to the header IVA.
 */
export function computeDeducible(expense: ExpenseLike): DeducibleTotals {
  const { moneda } = expense;
  let d10: number;
  let d5: number;
  if (expense.items.length > 0) {
    d10 = 0;
    d5 = 0;
    for (const item of expense.items) {
      const pct = clampPercent(item.deduciblePercent) / 100;
      const iva = itemIva(item.total, item.tasa, moneda);
      if (item.tasa === 10) d10 += iva * pct;
      else if (item.tasa === 5) d5 += iva * pct;
    }
    d10 = Math.min(roundMoney(d10, moneda), expense.iva10);
    d5 = Math.min(roundMoney(d5, moneda), expense.iva5);
  } else {
    const pct = clampPercent(expense.deduciblePercent) / 100;
    d10 = roundMoney(expense.iva10 * pct, moneda);
    d5 = roundMoney(expense.iva5 * pct, moneda);
  }
  const total = roundMoney(d10 + d5, moneda);
  const ivaAll = roundMoney(expense.iva10 + expense.iva5, moneda);
  return {
    ivaDeducible10: d10,
    ivaDeducible5: d5,
    ivaDeducible: total,
    ivaNoDeducible: Math.max(0, roundMoney(ivaAll - total, moneda)),
  };
}

export function clampPercent(v: number): number {
  if (!Number.isFinite(v)) return 100;
  return Math.min(100, Math.max(0, Math.round(v)));
}

/** Sum of item totals vs the expense total — used for the review warning. */
export function itemsMatchTotal(
  items: DeductibleItemInput[],
  total: number,
  currency: string
): boolean {
  if (items.length === 0) return true;
  const sum = items.reduce((acc, it) => acc + it.total, 0);
  const tolerance = currency === "PYG" ? 5 : 0.06;
  return Math.abs(roundMoney(sum, currency) - total) <= tolerance;
}
