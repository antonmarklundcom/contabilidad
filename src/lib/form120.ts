/**
 * Formulario 120 (IVA General — liquidación mensual) working draft.
 *
 * Computes the month's figures from the Libro Ventas (débito fiscal) and
 * Libro Compras (crédito fiscal = the DEDUCIBLE part of purchase IVA, see
 * lib/deductibility.ts), plus the previous period's saldo a favor.
 *
 * This is a preparation aid: it produces the numbers to load into the real
 * Formulario 120 in Marangatu. It deliberately does NOT claim to be the
 * official form (casilla layouts change with DNIT resolutions), so the UI
 * and PDF label it "borrador de trabajo".
 *
 * The arithmetic lives in `computeForm120` (pure, tested); DB access lives
 * in `buildForm120`.
 */
import { prisma } from "@/lib/prisma";
import { libroVentas, libroCompras, type LibroTotals } from "@/lib/accounting";

export interface Form120Data {
  year: number;
  month: number;
  ventas: {
    gravada10: number;
    debito10: number;
    gravada5: number;
    debito5: number;
    exentas: number;
    total: number;
    debitoFiscal: number;
  };
  compras: {
    gravada10: number;
    iva10: number;
    gravada5: number;
    iva5: number;
    exentas: number;
    total: number;
    credito10: number;
    credito5: number;
    ivaNoDeducible: number;
    creditoFiscal: number;
  };
  /** Saldo a favor del contribuyente arrastrado del período anterior. */
  saldoAnterior: number;
  /** debitoFiscal − creditoFiscal − saldoAnterior. */
  resultado: number;
  /** resultado > 0 → impuesto a pagar. */
  aPagar: number;
  /** resultado < 0 → saldo a favor para el período siguiente. */
  saldoAFavor: number;
  documentCounts: { ventas: number; compras: number };
}

export function computeForm120(
  year: number,
  month: number,
  ventas: LibroTotals,
  compras: LibroTotals,
  saldoAnterior: number,
  documentCounts: { ventas: number; compras: number }
): Form120Data {
  const debitoFiscal = Math.round(ventas.iva10 + ventas.iva5);
  const creditoFiscal = Math.round(compras.ivaDeducible10 + compras.ivaDeducible5);
  const resultado = Math.round(debitoFiscal - creditoFiscal - saldoAnterior);
  return {
    year,
    month,
    ventas: {
      gravada10: ventas.gravada10,
      debito10: ventas.iva10,
      gravada5: ventas.gravada5,
      debito5: ventas.iva5,
      exentas: ventas.exenta,
      total: ventas.total,
      debitoFiscal,
    },
    compras: {
      gravada10: compras.gravada10,
      iva10: compras.iva10,
      gravada5: compras.gravada5,
      iva5: compras.iva5,
      exentas: compras.exenta,
      total: compras.total,
      credito10: compras.ivaDeducible10,
      credito5: compras.ivaDeducible5,
      ivaNoDeducible: Math.max(
        0,
        Math.round(compras.iva10 + compras.iva5 - compras.ivaDeducible10 - compras.ivaDeducible5)
      ),
      creditoFiscal,
    },
    saldoAnterior,
    resultado,
    aPagar: Math.max(0, resultado),
    saldoAFavor: Math.max(0, -resultado),
    documentCounts,
  };
}

const saldoKey = (year: number, month: number) =>
  `f120.saldoAnterior.${year}-${String(month).padStart(2, "0")}`;

export async function getSaldoAnterior(
  companyId: string,
  year: number,
  month: number
): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { companyId_key: { companyId, key: saldoKey(year, month) } },
  });
  const v = Number(setting?.value);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

export async function setSaldoAnterior(
  companyId: string,
  year: number,
  month: number,
  value: number
): Promise<void> {
  await prisma.setting.upsert({
    where: { companyId_key: { companyId, key: saldoKey(year, month) } },
    update: { value: String(value) },
    create: { companyId, key: saldoKey(year, month), value: String(value) },
  });
}

export interface PeriodClose {
  closedBy: string;
  closedAt: string;
  snapshot: Form120Data;
  /** Frozen close PDFs stored under exports/ (absent on closes made before this feature). */
  files?: { form120: string; report: string };
}

const closeKey = (year: number, month: number) =>
  `f120.closed.${year}-${String(month).padStart(2, "0")}`;

export async function getPeriodClose(
  companyId: string,
  year: number,
  month: number
): Promise<PeriodClose | null> {
  const setting = await prisma.setting.findUnique({
    where: { companyId_key: { companyId, key: closeKey(year, month) } },
  });
  if (!setting) return null;
  try {
    return JSON.parse(setting.value) as PeriodClose;
  } catch {
    return null;
  }
}

/** Records human sign-off and freezes the figures as of close time. Idempotent — closing again overwrites the snapshot. */
export async function closePeriod(
  companyId: string,
  year: number,
  month: number,
  closedBy: string,
  snapshot: Form120Data,
  files?: PeriodClose["files"]
): Promise<void> {
  const value: PeriodClose = { closedBy, closedAt: new Date().toISOString(), snapshot, files };
  await prisma.setting.upsert({
    where: { companyId_key: { companyId, key: closeKey(year, month) } },
    update: { value: JSON.stringify(value) },
    create: { companyId, key: closeKey(year, month), value: JSON.stringify(value) },
  });
}

/** The period following year-month. */
export function nextPeriod(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/**
 * Seeds the next period's saldo anterior from a closed period's saldo a
 * favor, so the carry-forward never depends on the user retyping it. The
 * value stays user-overridable via the saldo form afterwards.
 */
export async function carryForwardSaldo(
  companyId: string,
  year: number,
  month: number,
  saldoAFavor: number
): Promise<void> {
  const next = nextPeriod(year, month);
  await setSaldoAnterior(companyId, next.year, next.month, Math.max(0, Math.round(saldoAFavor)));
}

export async function reopenPeriod(companyId: string, year: number, month: number): Promise<void> {
  await prisma.setting.deleteMany({ where: { companyId, key: closeKey(year, month) } });
}

export async function buildForm120(
  companyId: string,
  year: number,
  month: number
): Promise<Form120Data> {
  const [ventas, compras, saldoAnterior] = await Promise.all([
    libroVentas(companyId, year, month),
    libroCompras(companyId, year, month),
    getSaldoAnterior(companyId, year, month),
  ]);
  return computeForm120(year, month, ventas.totals, compras.totals, saldoAnterior, {
    ventas: ventas.rows.length,
    compras: compras.rows.length,
  });
}
