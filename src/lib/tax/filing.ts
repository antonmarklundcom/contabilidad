/**
 * Tax filings — the durable record of a closed period.
 *
 * Replaces the `f120.closed.YYYY-MM` JSON blob that used to live in `Setting`.
 * The 20260804094717_tax_filing migration copies the old rows across (copy, not
 * move: tax documents are never deleted).
 *
 * The snapshot is immutable. Closing writes it once; reopening deletes the
 * filing outright rather than editing it, so a declared figure can never be
 * quietly rewritten in place.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma, TaxFiling, TaxFilingStatus } from "@prisma/client";
import type { Form120Data } from "@/lib/form120";
import { ivaDueDate } from "@/lib/tax/calendar";
import { formatRuc } from "@/lib/sifen/ruc";

/** Shape the pre-TaxFiling callers expect. Kept stable on purpose. */
export interface PeriodClose {
  closedBy: string;
  closedAt: string;
  snapshot: Form120Data;
}

/**
 * The IVA due date for a period, from the company's RUC.
 *
 * Falls back to the 7th of the following month — the earliest day in the
 * perpetual calendar — when the RUC cannot be parsed. Early is safe; late is
 * not, and a filing row must always have a due date.
 */
export async function ivaDueDateForCompany(
  companyId: string,
  year: number,
  month: number
): Promise<Date> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { ruc: true, dv: true },
  });
  const due = company ? ivaDueDate(formatRuc(company.ruc, company.dv), year, month) : null;
  if (due) return due;
  const fallbackMonth = month === 12 ? 1 : month + 1;
  const fallbackYear = month === 12 ? year + 1 : year;
  return new Date(Date.UTC(fallbackYear, fallbackMonth - 1, 7));
}

/** The filing row for a period, or null. */
export function getFiling(
  companyId: string,
  year: number,
  month: number
): Promise<TaxFiling | null> {
  return prisma.taxFiling.findUnique({
    where: { companyId_type_year_month: { companyId, type: "IVA", year, month } },
  });
}

/**
 * The period close in the legacy shape, or null when the period is not closed.
 *
 * Signature unchanged from the `Setting`-backed version so existing callers
 * (`/taxes`) keep working untouched.
 */
export async function getPeriodClose(
  companyId: string,
  year: number,
  month: number
): Promise<PeriodClose | null> {
  const filing = await getFiling(companyId, year, month);
  if (!filing || !filing.closedAt || filing.status === "DRAFT") return null;
  return {
    closedBy: filing.closedBy ?? "unknown",
    closedAt: filing.closedAt.toISOString(),
    snapshot: filing.snapshot as unknown as Form120Data,
  };
}

/**
 * Records human sign-off and freezes the figures as of close time.
 *
 * Idempotent in the same sense as before: closing an already-closed period
 * re-freezes it with the current figures and a new `closedAt`. Status
 * transitions already made (SUBMITTED, PAID) are preserved — a re-close must
 * not silently walk a filing backwards to CLOSED.
 */
export async function closePeriod(
  companyId: string,
  year: number,
  month: number,
  closedBy: string,
  snapshot: Form120Data
): Promise<TaxFiling> {
  const dueDate = await ivaDueDateForCompany(companyId, year, month);
  const closedAt = new Date();
  const snapshotJson = snapshot as unknown as Prisma.InputJsonValue;

  const existing = await getFiling(companyId, year, month);
  const status: TaxFilingStatus =
    existing && existing.status !== "DRAFT" ? existing.status : "CLOSED";

  return prisma.taxFiling.upsert({
    where: { companyId_type_year_month: { companyId, type: "IVA", year, month } },
    update: { status, dueDate, snapshot: snapshotJson, closedBy, closedAt },
    create: {
      companyId,
      type: "IVA",
      year,
      month,
      status: "CLOSED",
      dueDate,
      snapshot: snapshotJson,
      closedBy,
      closedAt,
    },
  });
}

/** Marks a closed filing as presented to DNIT. */
export async function markSubmitted(
  companyId: string,
  filingId: string,
  submittedAt: Date = new Date()
): Promise<number> {
  // Scoped by companyId as well as id — never trust the id alone.
  const res = await prisma.taxFiling.updateMany({
    where: { id: filingId, companyId, status: { in: ["CLOSED", "PAID"] } },
    data: { status: "SUBMITTED", submittedAt },
  });
  return res.count;
}

/** Marks a submitted filing as paid. */
export async function markPaid(
  companyId: string,
  filingId: string,
  paidAt: Date = new Date()
): Promise<number> {
  const res = await prisma.taxFiling.updateMany({
    where: { id: filingId, companyId, status: { in: ["CLOSED", "SUBMITTED"] } },
    data: { status: "PAID", paidAt },
  });
  return res.count;
}

/** Attaches the DNIT receipt PDF path to a filing. */
export async function attachOfficialPdf(
  companyId: string,
  filingId: string,
  officialPdfPath: string
): Promise<number> {
  const res = await prisma.taxFiling.updateMany({
    where: { id: filingId, companyId },
    data: { officialPdfPath },
  });
  return res.count;
}

/** Free-text note on a filing. */
export async function setFilingNotes(
  companyId: string,
  filingId: string,
  notes: string
): Promise<number> {
  const res = await prisma.taxFiling.updateMany({
    where: { id: filingId, companyId },
    data: { notes: notes || null },
  });
  return res.count;
}

export interface FilingListFilters {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Filings for the archive list. Filtered by due date (the date the list is
 * sorted and range-filtered on) and by a free-text period match, following the
 * standard list-controls contract.
 */
export async function listFilings(companyId: string, filters: FilingListFilters = {}) {
  const pageSize = filters.pageSize ?? 25;
  const page = Math.max(1, filters.page ?? 1);

  const where: Prisma.TaxFilingWhereInput = {
    companyId,
    ...(filters.status ? { status: filters.status as TaxFilingStatus } : {}),
    ...(filters.from || filters.to
      ? {
          dueDate: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59`) } : {}),
          },
        }
      : {}),
  };

  // Search matches the period label ("2026-05", "2026", "05") and the closer.
  const q = filters.q?.trim();
  if (q) {
    const asNumber = Number(q.replace(/\D/g, ""));
    const periodMatch = q.match(/^(\d{4})-(\d{1,2})$/);
    where.OR = [
      { closedBy: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
      ...(periodMatch
        ? [{ year: Number(periodMatch[1]), month: Number(periodMatch[2]) }]
        : []),
      ...(Number.isFinite(asNumber) && asNumber > 1900 && asNumber < 3000
        ? [{ year: asNumber }]
        : []),
    ];
  }

  const [rows, count] = await Promise.all([
    prisma.taxFiling.findMany({
      where,
      orderBy: [{ year: "desc" }, { month: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.taxFiling.count({ where }),
  ]);

  return { rows, count, page, pages: Math.max(1, Math.ceil(count / pageSize)) };
}

/**
 * Reopens a period by deleting its filing.
 *
 * The snapshot is immutable, so "reopen" cannot mean "edit" — it means the
 * declared record is withdrawn and a later close writes a fresh one. The
 * `Setting` row this filing may have been copied from is left alone, exactly
 * as the migration left it.
 */
export async function reopenPeriod(
  companyId: string,
  year: number,
  month: number
): Promise<void> {
  await prisma.taxFiling.deleteMany({ where: { companyId, type: "IVA", year, month } });
}
