/**
 * Money / IVA helpers.
 * PYG has no decimals — every PYG amount is rounded to an integer.
 * USD (and other currencies) keep 2 decimals.
 */

export function roundMoney(amount: number, currency: string): number {
  if (currency === "PYG") return Math.round(amount);
  return Math.round(amount * 100) / 100;
}

export interface LineInput {
  cantidad: number;
  precioUnitario: number;
  /** Per-unit discount (same currency as the price). */
  descuento?: number;
  /** 10 | 5 | 0 (0 = exenta) */
  iva: number;
  /** SIFEN ivaProporcion, percentage of the price that is taxed (default 100). */
  ivaProporcion?: number;
}

export interface InvoiceTotals {
  gravada10: number;
  gravada5: number;
  exenta: number;
  iva10: number;
  iva5: number;
  totalIva: number;
  totalDescuento: number;
  total: number;
}

/**
 * SIFEN convention: unit prices are IVA-INCLUDED ("precio con IVA").
 * For a 10% line, base = total / 1.10 and IVA = total − base.
 * For a 5% line, base = total / 1.05.
 */
export function computeLineAmounts(line: LineInput, currency: string) {
  const proporcion = (line.ivaProporcion ?? 100) / 100;
  const lineTotal = roundMoney(
    line.cantidad * (line.precioUnitario - (line.descuento ?? 0)),
    currency
  );
  const taxedPortion = lineTotal * proporcion;
  let iva = 0;
  if (line.iva === 10) iva = taxedPortion - taxedPortion / 1.1;
  else if (line.iva === 5) iva = taxedPortion - taxedPortion / 1.05;
  iva = roundMoney(iva, currency);
  const gravada = line.iva === 0 ? 0 : roundMoney(taxedPortion - iva, currency);
  const exenta = line.iva === 0 ? lineTotal : roundMoney(lineTotal - taxedPortion, currency);
  return { lineTotal, iva, gravada, exenta };
}

export function computeInvoiceTotals(lines: LineInput[], currency: string): InvoiceTotals {
  const t: InvoiceTotals = {
    gravada10: 0,
    gravada5: 0,
    exenta: 0,
    iva10: 0,
    iva5: 0,
    totalIva: 0,
    totalDescuento: 0,
    total: 0,
  };
  for (const line of lines) {
    const a = computeLineAmounts(line, currency);
    if (line.iva === 10) {
      t.gravada10 += a.gravada;
      t.iva10 += a.iva;
    } else if (line.iva === 5) {
      t.gravada5 += a.gravada;
      t.iva5 += a.iva;
    }
    t.exenta += a.exenta;
    t.totalDescuento += roundMoney((line.descuento ?? 0) * line.cantidad, currency);
    t.total += a.lineTotal;
  }
  t.totalIva = roundMoney(t.iva10 + t.iva5, currency);
  for (const k of Object.keys(t) as (keyof InvoiceTotals)[]) {
    t[k] = roundMoney(t[k], currency);
  }
  return t;
}
