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
import type { Prisma, TaxFiling, TaxFilingStatus, TaxFilingType } from "@prisma/client";
import type { Form120Data } from "@/lib/form120";
import type { IrpData } from "@/lib/irp";
import { irpDueDate, ivaDueDate } from "@/lib/tax/calendar";
import { ANNUAL_MONTH } from "@/lib/tax/filing-period";
import { formatRuc } from "@/lib/sifen/ruc";
import {
  MUTABLE_FILING_STATUSES,
  canOverwriteSnapshot,
  type FilingStatus,
} from "@/lib/tax/filing-status";

// The pure guards live in `filing-status.ts` so the UI can share them; they
// are re-exported here because this module is the filings' front door.
export {
  MUTABLE_FILING_STATUSES,
  canReopenFiling,
  canOverwriteSnapshot,
  type FilingStatus,
} from "@/lib/tax/filing-status";
export { ANNUAL_MONTH, isAnnualPeriod, periodLabel } from "@/lib/tax/filing-period";

/** Compile-time proof that the client-safe union matches the Prisma enum. */
const _statusesMatch: FilingStatus extends TaxFilingStatus
  ? TaxFilingStatus extends FilingStatus
    ? true
    : never
  : never = true;
void _statusesMatch;

/**
 * What a frozen filing carries. One union rather than one table per tax: the
 * `TaxFiling` row already says which via `type`, and every consumer branches
 * on that anyway.
 */
export type FilingSnapshot = Form120Data | IrpData;

/** Shape the pre-TaxFiling callers expect. Kept stable on purpose. */
export interface PeriodClose {
  closedBy: string;
  closedAt: string;
  snapshot: Form120Data;
  /** Lifecycle status of the underlying filing — the UI needs it to know
   *  whether reopening is still allowed. */
  status: TaxFilingStatus;
}

/** Refusal reason shared by both guarded mutations. */
export type FilingLocked = { ok: false; reason: "locked"; status: TaxFilingStatus };
export type ClosePeriodResult = { ok: true; filing: TaxFiling } | FilingLocked;
export type ReopenPeriodResult = { ok: true; deleted: number } | FilingLocked;

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

/**
 * The IRP due date for a fiscal year, from the company's RUC.
 *
 * Same fallback reasoning as the IVA one: the earliest day in the perpetual
 * calendar, because early is safe and a filing row must always have a due
 * date. IRP falls due in March of the following calendar year.
 */
export async function irpDueDateForCompany(companyId: string, year: number): Promise<Date> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { ruc: true, dv: true },
  });
  const due = company ? irpDueDate(formatRuc(company.ruc, company.dv), year) : null;
  return due ?? new Date(Date.UTC(year + 1, 2, 7));
}

/** The filing row for any (type, year, month), or null. */
export function getFilingRecord(
  companyId: string,
  type: TaxFilingType,
  year: number,
  month: number
): Promise<TaxFiling | null> {
  return prisma.taxFiling.findUnique({
    where: { companyId_type_year_month: { companyId, type, year, month } },
  });
}

/** The annual IRP filing row for a fiscal year, or null. */
export function getAnnualFiling(companyId: string, year: number): Promise<TaxFiling | null> {
  return getFilingRecord(companyId, "IRP", year, ANNUAL_MONTH);
}

/** The filing row for a period, or null. */
export function getFiling(
  companyId: string,
  year: number,
  month: number
): Promise<TaxFiling | null> {
  return getFilingRecord(companyId, "IVA", year, month);
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
    status: filing.status,
  };
}

/** `getPeriodClose`'s annual twin: the signed-off IRP return, or null. */
export interface AnnualClose {
  closedBy: string;
  closedAt: string;
  snapshot: IrpData;
  status: TaxFilingStatus;
}

/**
 * The declared IRP return for a fiscal year, or null when it is not closed.
 *
 * DRAFT rows are ignored for the same reason `getPeriodClose` ignores them: a
 * draft snapshot is a convenience copy, never a declared figure.
 */
export async function getAnnualClose(
  companyId: string,
  year: number
): Promise<AnnualClose | null> {
  const filing = await getAnnualFiling(companyId, year);
  if (!filing || !filing.closedAt || filing.status === "DRAFT") return null;
  return {
    closedBy: filing.closedBy ?? "unknown",
    closedAt: filing.closedAt.toISOString(),
    snapshot: filing.snapshot as unknown as IrpData,
    status: filing.status,
  };
}

/**
 * Records human sign-off and freezes the figures as of close time.
 *
 * Idempotent while the period is still a working state: re-closing a `DRAFT`
 * or `CLOSED` period re-freezes it with the current figures and a new
 * `closedAt`. Once the filing is `SUBMITTED` or `PAID` the snapshot is a
 * declared fact and the close is **refused** — the caller gets
 * `{ ok: false, reason: "locked" }`, never a silently rewritten declaration.
 */
export async function closePeriod(
  companyId: string,
  year: number,
  month: number,
  closedBy: string,
  snapshot: Form120Data
): Promise<ClosePeriodResult> {
  const dueDate = await ivaDueDateForCompany(companyId, year, month);
  return closeFiling(companyId, { type: "IVA", year, month, dueDate }, closedBy, snapshot);
}

/** Which filing a close or reopen is about. */
export interface FilingKey {
  type: TaxFilingType;
  year: number;
  /** `ANNUAL_MONTH` (0) for annual obligations — never null; see filing-period.ts. */
  month: number;
}

/**
 * The guarded close, for any tax.
 *
 * `closePeriod` (IVA, monthly) and `closeAnnualFiling` (IRP, yearly) are both
 * this function with a due date worked out first — the immutability guard,
 * the atomic status filter and the re-read on contention are written once, so
 * a second tax cannot arrive with a second, subtly weaker version of them.
 */
export async function closeFiling(
  companyId: string,
  key: FilingKey & { dueDate: Date },
  closedBy: string,
  snapshot: FilingSnapshot
): Promise<ClosePeriodResult> {
  const { type, year, month, dueDate } = key;
  const closedAt = new Date();
  const snapshotJson = snapshot as unknown as Prisma.InputJsonValue;

  const existing = await getFilingRecord(companyId, type, year, month);

  if (existing) {
    if (!canOverwriteSnapshot(existing.status)) {
      return { ok: false, reason: "locked", status: existing.status };
    }
    // The status filter makes the guard atomic: a filing that becomes
    // SUBMITTED between the read and the write matches no row and is re-read
    // rather than overwritten.
    const res = await prisma.taxFiling.updateMany({
      where: {
        id: existing.id,
        companyId,
        status: { in: [...MUTABLE_FILING_STATUSES] },
      },
      data: { status: "CLOSED", dueDate, snapshot: snapshotJson, closedBy, closedAt },
    });
    const after = await getFilingRecord(companyId, type, year, month);
    if (res.count === 0) {
      return { ok: false, reason: "locked", status: after?.status ?? existing.status };
    }
    return { ok: true, filing: after! };
  }

  const created = await prisma.taxFiling.create({
    data: {
      companyId,
      type,
      year,
      month,
      status: "CLOSED",
      dueDate,
      snapshot: snapshotJson,
      closedBy,
      closedAt,
    },
  });
  return { ok: true, filing: created };
}

/**
 * Closes the annual IRP return for a fiscal year.
 *
 * The annual row carries `ANNUAL_MONTH`, so the same unique constraint that
 * dedupes monthly filings dedupes this one — the thing the
 * `taxfiling_annual_month_sentinel` migration was for.
 */
export async function closeAnnualFiling(
  companyId: string,
  year: number,
  closedBy: string,
  snapshot: IrpData
): Promise<ClosePeriodResult> {
  const dueDate = await irpDueDateForCompany(companyId, year);
  return closeFiling(
    companyId,
    { type: "IRP", year, month: ANNUAL_MONTH, dueDate },
    closedBy,
    snapshot
  );
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
  /** `IVA` | `IRP`. Anything else is ignored rather than returning nothing. */
  type?: string;
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
    ...(filters.type === "IVA" || filters.type === "IRP"
      ? { type: filters.type as TaxFilingType }
      : {}),
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
      // Newest period first; within a year the annual filing (month 0) sorts
      // last, after the twelve months it rolls up.
      orderBy: [{ year: "desc" }, { month: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.taxFiling.count({ where }),
  ]);

  return { rows, count, page, pages: Math.max(1, Math.ceil(count / pageSize)) };
}

/**
 * Reopens a period by withdrawing its filing.
 *
 * The snapshot is immutable, so "reopen" cannot mean "edit" — it means the
 * declared record is withdrawn and a later close writes a fresh one. Only a
 * `DRAFT`/`CLOSED` filing may be withdrawn: once it is `SUBMITTED` or `PAID`
 * the deletion would destroy the snapshot, `submittedAt` and the DNIT receipt
 * pointer behind a filing that DNIT has already seen, so it is refused.
 *
 * The status filter lives in the `deleteMany` itself, so the check and the
 * delete are one atomic statement. The `Setting` row this filing may have been
 * copied from is left alone, exactly as the migration left it.
 */
export async function reopenPeriod(
  companyId: string,
  year: number,
  month: number
): Promise<ReopenPeriodResult> {
  return reopenFiling(companyId, { type: "IVA", year, month });
}

/** Withdraws the annual IRP filing for a fiscal year. */
export async function reopenAnnualFiling(
  companyId: string,
  year: number
): Promise<ReopenPeriodResult> {
  return reopenFiling(companyId, { type: "IRP", year, month: ANNUAL_MONTH });
}

/** The guarded withdrawal, for any tax. See `reopenPeriod` for the reasoning. */
export async function reopenFiling(
  companyId: string,
  key: FilingKey
): Promise<ReopenPeriodResult> {
  const { type, year, month } = key;
  const res = await prisma.taxFiling.deleteMany({
    where: {
      companyId,
      type,
      year,
      month,
      status: { in: [...MUTABLE_FILING_STATUSES] },
    },
  });
  if (res.count === 0) {
    const existing = await getFilingRecord(companyId, type, year, month);
    // Nothing to withdraw is a no-op, not a refusal; a locked row is a refusal.
    if (existing) return { ok: false, reason: "locked", status: existing.status };
  }
  return { ok: true, deleted: res.count };
}
