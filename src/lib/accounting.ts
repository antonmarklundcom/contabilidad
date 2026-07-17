import { prisma } from "@/lib/prisma";
import { computeDeducible } from "@/lib/deductibility";

export interface LibroRow {
  id: string;
  fecha: Date | null;
  tipo: string;
  numero: string;
  timbrado: string;
  ruc: string;
  razonSocial: string;
  gravada10: number;
  gravada5: number;
  exenta: number;
  iva10: number;
  iva5: number;
  total: number;
  /** Compras only — creditable IVA per rate (see lib/deductibility.ts). */
  ivaDeducible10?: number;
  ivaDeducible5?: number;
  ivaDeducible?: number;
}

export interface LibroTotals {
  gravada10: number;
  gravada5: number;
  exenta: number;
  iva10: number;
  iva5: number;
  total: number;
  ivaDeducible10: number;
  ivaDeducible5: number;
  ivaDeducible: number;
}

function emptyTotals(): LibroTotals {
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
  };
}

function sumRows(rows: LibroRow[]): LibroTotals {
  const t = emptyTotals();
  for (const r of rows) {
    t.gravada10 += r.gravada10;
    t.gravada5 += r.gravada5;
    t.exenta += r.exenta;
    t.iva10 += r.iva10;
    t.iva5 += r.iva5;
    t.total += r.total;
    t.ivaDeducible10 += r.ivaDeducible10 ?? r.iva10;
    t.ivaDeducible5 += r.ivaDeducible5 ?? r.iva5;
    t.ivaDeducible += r.ivaDeducible ?? r.iva10 + r.iva5;
  }
  return t;
}

function monthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

const TIPO_DOC: Record<number, string> = {
  1: "Factura",
  5: "Nota de crédito",
  6: "Nota de débito",
};

/** Libro IVA Ventas — approved sales documents for the month. */
export async function libroVentas(
  companyId: string,
  year: number,
  month: number
): Promise<{ rows: LibroRow[]; totals: LibroTotals }> {
  const { start, end } = monthRange(year, month);
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      status: "APPROVED",
      issueDate: { gte: start, lte: end },
    },
    orderBy: { issueDate: "asc" },
    include: { client: true },
  });
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const rows: LibroRow[] = invoices.map((inv) => ({
    id: inv.id,
    fecha: inv.issueDate,
    tipo: TIPO_DOC[inv.tipoDocumento] ?? "DTE",
    numero: inv.fullNumber ?? "",
    timbrado: company?.timbradoNumero ?? "",
    ruc:
      inv.client.docType === "RUC" && inv.client.ruc
        ? `${inv.client.ruc}-${inv.client.dv}`
        : (inv.client.documentoNumero ?? ""),
    razonSocial: inv.client.razonSocial,
    gravada10: Number(inv.totalGravada10),
    gravada5: Number(inv.totalGravada5),
    exenta: Number(inv.totalExenta),
    iva10: Number(inv.totalIva10),
    iva5: Number(inv.totalIva5),
    total: Number(inv.total),
  }));
  return { rows, totals: sumRows(rows) };
}

/** Libro IVA Compras — confirmed expenses for the month. */
export async function libroCompras(
  companyId: string,
  year: number,
  month: number
): Promise<{ rows: LibroRow[]; totals: LibroTotals }> {
  const { start, end } = monthRange(year, month);
  const expenses = await prisma.expense.findMany({
    where: {
      companyId,
      status: "CONFIRMED",
      fecha: { gte: start, lte: end },
    },
    orderBy: { fecha: "asc" },
    include: { items: true },
  });
  const rows: LibroRow[] = expenses.map((e) => {
    const deducible = computeDeducible({
      iva10: Number(e.iva10),
      iva5: Number(e.iva5),
      deduciblePercent: e.deduciblePercent,
      moneda: e.moneda,
      items: e.items.map((item) => ({
        total: Number(item.total),
        tasa: item.tasa,
        deduciblePercent: item.deduciblePercent,
      })),
    });
    return {
      id: e.id,
      fecha: e.fecha,
      tipo: e.tipoComprobante ?? "Factura",
      numero: e.numeroComprobante ?? "",
      timbrado: e.timbrado ?? "",
      ruc: e.supplierRuc ? `${e.supplierRuc}-${e.supplierDv ?? ""}` : "",
      razonSocial: e.supplierRazonSocial ?? "",
      gravada10: Number(e.gravada10),
      gravada5: Number(e.gravada5),
      exenta: Number(e.exenta),
      iva10: Number(e.iva10),
      iva5: Number(e.iva5),
      total: Number(e.total),
      ivaDeducible10: deducible.ivaDeducible10,
      ivaDeducible5: deducible.ivaDeducible5,
      ivaDeducible: deducible.ivaDeducible,
    };
  });
  return { rows, totals: sumRows(rows) };
}

export interface DashboardData {
  incomeThisMonth: number;
  expensesThisMonth: number;
  ivaDebito: number;
  ivaCredito: number;
  ivaPosition: number; // positive = a pagar, negative = saldo a favor
  pendingCount: number;
  rejectedCount: number;
  contingencyCount: number;
  queuedCount: number;
  needsReviewCount: number;
}

export async function dashboardData(
  companyId: string,
  year: number,
  month: number
): Promise<DashboardData> {
  const ventas = await libroVentas(companyId, year, month);
  const compras = await libroCompras(companyId, year, month);
  const [rejectedCount, contingencyCount, queuedCount, needsReviewCount] = await Promise.all([
    prisma.invoice.count({ where: { companyId, status: "REJECTED" } }),
    prisma.invoice.count({ where: { companyId, status: "CONTINGENCY" } }),
    prisma.invoice.count({ where: { companyId, status: { in: ["QUEUED", "SENT"] } } }),
    prisma.expense.count({ where: { companyId, status: "NEEDS_REVIEW" } }),
  ]);
  const ivaDebito = ventas.totals.iva10 + ventas.totals.iva5;
  // Only the deducible part of purchase IVA is fiscal credit.
  const ivaCredito = compras.totals.ivaDeducible;
  return {
    incomeThisMonth: ventas.totals.total,
    expensesThisMonth: compras.totals.total,
    ivaDebito,
    ivaCredito,
    ivaPosition: ivaDebito - ivaCredito,
    pendingCount: queuedCount + contingencyCount,
    rejectedCount,
    contingencyCount,
    queuedCount,
    needsReviewCount,
  };
}

/** Monthly income vs expense series for the trend chart (last N months). */
export async function monthlyTrend(
  companyId: string,
  months: number
): Promise<{ year: number; month: number; income: number; expenses: number }[]> {
  const now = new Date();
  const series: { year: number; month: number; income: number; expenses: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const [v, c] = await Promise.all([
      libroVentas(companyId, year, month),
      libroCompras(companyId, year, month),
    ]);
    series.push({ year, month, income: v.totals.total, expenses: c.totals.total });
  }
  return series;
}
