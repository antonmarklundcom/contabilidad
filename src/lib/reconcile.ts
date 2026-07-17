/**
 * Monthly reconciliation checks — the discrepancy list behind the
 * "declaración jurada" close. We can produce this natively because we are
 * the emitter (see PLAN.md Phase 1 §2): unlike a tool that only reads
 * Marangatú after the fact, we know the moment a document leaves DRAFT.
 */
import { prisma } from "@/lib/prisma";

export interface UnresolvedInvoice {
  id: string;
  fullNumber: string | null;
  status: string;
  issueDate: Date;
  total: number;
  clientName: string;
}

export interface UnresolvedExpense {
  id: string;
  supplierRazonSocial: string | null;
  numeroComprobante: string | null;
  fecha: Date | null;
  total: number;
  reason: "NEEDS_REVIEW" | "DUPLICATE_SUSPECT";
}

export interface ReconciliationData {
  year: number;
  month: number;
  /** Invoices dated in the period that never reached APPROVED. */
  unresolvedInvoices: UnresolvedInvoice[];
  /** Expenses dated in the period still needing review, or flagged as duplicates. */
  unresolvedExpenses: UnresolvedExpense[];
  clean: boolean;
}

function periodRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

export async function buildReconciliation(
  companyId: string,
  year: number,
  month: number
): Promise<ReconciliationData> {
  const { start, end } = periodRange(year, month);

  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      issueDate: { gte: start, lt: end },
      status: { in: ["DRAFT", "QUEUED", "SENT", "REJECTED", "CONTINGENCY"] },
    },
    include: { client: { select: { razonSocial: true } } },
    orderBy: { issueDate: "asc" },
  });

  const expensesNeedsReview = await prisma.expense.findMany({
    where: { companyId, fecha: { gte: start, lt: end }, status: "NEEDS_REVIEW" },
    orderBy: { fecha: "asc" },
  });

  const expensesDuplicates = await prisma.expense.findMany({
    where: {
      companyId,
      fecha: { gte: start, lt: end },
      duplicateOfId: { not: null },
    },
    orderBy: { fecha: "asc" },
  });

  const unresolvedInvoices: UnresolvedInvoice[] = invoices.map((inv) => ({
    id: inv.id,
    fullNumber: inv.fullNumber,
    status: inv.status,
    issueDate: inv.issueDate,
    total: Number(inv.total),
    clientName: inv.client.razonSocial,
  }));

  const unresolvedExpenses: UnresolvedExpense[] = [
    ...expensesNeedsReview.map((e) => ({
      id: e.id,
      supplierRazonSocial: e.supplierRazonSocial,
      numeroComprobante: e.numeroComprobante,
      fecha: e.fecha,
      total: Number(e.total),
      reason: "NEEDS_REVIEW" as const,
    })),
    ...expensesDuplicates.map((e) => ({
      id: e.id,
      supplierRazonSocial: e.supplierRazonSocial,
      numeroComprobante: e.numeroComprobante,
      fecha: e.fecha,
      total: Number(e.total),
      reason: "DUPLICATE_SUSPECT" as const,
    })),
  ];

  return {
    year,
    month,
    unresolvedInvoices,
    unresolvedExpenses,
    clean: unresolvedInvoices.length === 0 && unresolvedExpenses.length === 0,
  };
}
