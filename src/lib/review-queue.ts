/**
 * The accountant's exception queue across every client (PLAN Phase 12).
 *
 * One list, over every company the user holds a Membership in, of the things
 * that need a human — so the accountant never opens a client that has
 * nothing to do. Classification is pure (`classifyExpense`) and tested
 * (tests/review-queue.test.ts); `buildReviewQueue` is only the I/O.
 *
 * The queue decides nothing. Every item links to the existing screen, where
 * the existing server actions (with `allowed()` and `audit()`) do the work.
 */
import { prisma } from "@/lib/prisma";
import { lookupSuppliers, normalizeRuc, type SupplierStatus } from "@/lib/padron";
import { nextDeadline, type NextDeadline } from "@/lib/tax/deadline";

import { LOW_CONFIDENCE } from "@/lib/confidence";

/** A deadline this close (or already past) makes the client show up. */
export const DEADLINE_WARNING_DAYS = 10;

export type ExpenseReason =
  | "CDC_MISMATCH"
  | "INACTIVE_SUPPLIER"
  | "DUPLICATE_SUSPECT"
  | "LOW_CONFIDENCE"
  | "NEEDS_REVIEW";

/** Most serious first; the queue sorts by the first reason an item has. */
const SEVERITY: readonly ExpenseReason[] = [
  "CDC_MISMATCH",
  "INACTIVE_SUPPLIER",
  "DUPLICATE_SUSPECT",
  "LOW_CONFIDENCE",
  "NEEDS_REVIEW",
];

export interface ExpenseForQueue {
  status: "NEEDS_REVIEW" | "CONFIRMED";
  duplicateOfId: string | null;
  cdcVerdict: string | null;
  confidence: unknown;
}

function minConfidence(confidence: unknown): number | null {
  if (!confidence || typeof confidence !== "object") return null;
  const values = Object.values(confidence as Record<string, unknown>).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  return values.length ? Math.min(...values) : null;
}

/**
 * Why a human must look at this expense, most serious first; empty when
 * nothing is wrong.
 *
 * An inactive supplier is flagged only while the expense is still
 * unreviewed: that is the moment it can still be caught cheaply. After a
 * human confirmed it, the period close discloses it instead (Phase 10).
 */
export function classifyExpense(
  e: ExpenseForQueue,
  supplier: Pick<SupplierStatus, "active"> | undefined
): ExpenseReason[] {
  const reasons = new Set<ExpenseReason>();
  if (e.cdcVerdict === "mismatch" || e.cdcVerdict === "rejected") reasons.add("CDC_MISMATCH");
  if (e.duplicateOfId) reasons.add("DUPLICATE_SUSPECT");
  if (e.status === "NEEDS_REVIEW") {
    reasons.add("NEEDS_REVIEW");
    if (supplier && !supplier.active) reasons.add("INACTIVE_SUPPLIER");
    const min = minConfidence(e.confidence);
    if (min !== null && min < LOW_CONFIDENCE) reasons.add("LOW_CONFIDENCE");
  }
  return SEVERITY.filter((r) => reasons.has(r));
}

export function deadlineNeedsAttention(d: Pick<NextDeadline, "overdue" | "daysRemaining"> | null): boolean {
  return Boolean(d && (d.overdue || d.daysRemaining <= DEADLINE_WARNING_DAYS));
}

export interface QueueItem {
  id: string;
  companyId: string;
  companyName: string;
  reasons: ExpenseReason[];
  supplier: string | null;
  numeroComprobante: string | null;
  fecha: Date | null;
  total: number;
  moneda: string;
  /** Padrón estado when the supplier is not active. */
  supplierEstado: string | null;
}

export interface CompanyBoardRow {
  companyId: string;
  companyName: string;
  ruc: string;
  openItems: number;
  deadline: NextDeadline | null;
  deadlineAttention: boolean;
}

/** Hard cap so one very behind client cannot make the page unusable. */
const MAX_ITEMS = 500;

export async function buildReviewQueue(
  userId: string,
  now: Date = new Date()
): Promise<{ items: QueueItem[]; board: CompanyBoardRow[]; truncated: boolean }> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { company: { select: { id: true, razonSocial: true, ruc: true, dv: true } } },
  });
  const companies = memberships.map((m) => m.company);
  if (companies.length === 0) return { items: [], board: [], truncated: false };
  const ids = companies.map((c) => c.id);
  const names = new Map(companies.map((c) => [c.id, c.razonSocial]));

  const expenses = await prisma.expense.findMany({
    where: {
      companyId: { in: ids },
      OR: [
        { status: "NEEDS_REVIEW" },
        { duplicateOfId: { not: null } },
        { cdcVerdict: { in: ["mismatch", "rejected"] } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: MAX_ITEMS + 1,
    select: {
      id: true,
      companyId: true,
      status: true,
      duplicateOfId: true,
      cdcVerdict: true,
      confidence: true,
      supplierRuc: true,
      supplierRazonSocial: true,
      numeroComprobante: true,
      fecha: true,
      total: true,
      moneda: true,
    },
  });
  const truncated = expenses.length > MAX_ITEMS;
  const rows = expenses.slice(0, MAX_ITEMS);
  const padron = await lookupSuppliers(rows.map((e) => e.supplierRuc));

  const items: QueueItem[] = [];
  for (const e of rows) {
    const hit = padron.get(normalizeRuc(e.supplierRuc));
    const reasons = classifyExpense(e, hit);
    if (reasons.length === 0) continue;
    items.push({
      id: e.id,
      companyId: e.companyId,
      companyName: names.get(e.companyId) ?? "—",
      reasons,
      supplier: e.supplierRazonSocial ?? e.supplierRuc,
      numeroComprobante: e.numeroComprobante,
      fecha: e.fecha,
      total: Number(e.total),
      moneda: e.moneda,
      supplierEstado: hit && !hit.active ? hit.estado : null,
    });
  }
  items.sort(
    (a, b) =>
      SEVERITY.indexOf(a.reasons[0]) - SEVERITY.indexOf(b.reasons[0]) ||
      (a.fecha?.getTime() ?? 0) - (b.fecha?.getTime() ?? 0)
  );

  const openByCompany = new Map<string, number>();
  for (const i of items) openByCompany.set(i.companyId, (openByCompany.get(i.companyId) ?? 0) + 1);

  const board: CompanyBoardRow[] = [];
  for (const c of companies) {
    const deadline = await nextDeadline(c.id, now);
    board.push({
      companyId: c.id,
      companyName: c.razonSocial,
      ruc: `${c.ruc}-${c.dv}`,
      openItems: openByCompany.get(c.id) ?? 0,
      deadline,
      deadlineAttention: deadlineNeedsAttention(deadline),
    });
  }
  // Clients needing something first, then alphabetical.
  board.sort(
    (a, b) =>
      Number(b.deadlineAttention || b.openItems > 0) - Number(a.deadlineAttention || a.openItems > 0) ||
      a.companyName.localeCompare(b.companyName)
  );

  return { items, board, truncated };
}
