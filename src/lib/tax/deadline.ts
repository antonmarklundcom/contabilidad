/**
 * The "next filing due" summary behind the deadline card on the dashboard and
 * /taxes.
 *
 * Answers one question: which period does the taxpayer still owe, when is it
 * due, and how far along is it. The date maths is `calendar.ts`; this module
 * only joins it to the filing record.
 */
import { prisma } from "@/lib/prisma";
import { formatRuc } from "@/lib/sifen/ruc";
import { daysUntil, ivaDueDate, nextIvaFiling } from "@/lib/tax/calendar";
import type { TaxFilingStatus } from "@prisma/client";

export interface NextDeadline {
  type: "IVA";
  year: number;
  month: number;
  dueDate: Date;
  daysRemaining: number;
  /** Past its due date and still not submitted. */
  overdue: boolean;
  /** DRAFT when no filing row exists yet — the period has not been closed. */
  status: TaxFilingStatus;
  filingId: string | null;
}

/**
 * The next IVA filing the company still owes.
 *
 * "Owes" means not yet SUBMITTED or PAID: the calendar picks the earliest
 * period whose due date has not passed, and any *earlier* period that was
 * closed but never submitted takes precedence, because that one is already
 * late and is the more urgent thing to show.
 *
 * Returns null when the RUC cannot be parsed — the card is then hidden rather
 * than showing a date we cannot stand behind.
 */
export async function nextDeadline(
  companyId: string,
  now: Date = new Date()
): Promise<NextDeadline | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { ruc: true, dv: true },
  });
  if (!company) return null;

  const ruc = formatRuc(company.ruc, company.dv);

  // An unsubmitted filing already past its due date outranks the upcoming one.
  const overdueFiling = await prisma.taxFiling.findFirst({
    where: {
      companyId,
      type: "IVA",
      status: { notIn: ["SUBMITTED", "PAID"] },
      dueDate: { lt: now },
    },
    orderBy: { dueDate: "asc" },
  });
  if (overdueFiling && overdueFiling.month !== null) {
    return {
      type: "IVA",
      year: overdueFiling.year,
      month: overdueFiling.month,
      dueDate: overdueFiling.dueDate,
      daysRemaining: daysUntil(overdueFiling.dueDate, now),
      overdue: true,
      status: overdueFiling.status,
      filingId: overdueFiling.id,
    };
  }

  const next = nextIvaFiling(ruc, now);
  if (!next || next.month === undefined) return null;

  const filing = await prisma.taxFiling.findUnique({
    where: {
      companyId_type_year_month: {
        companyId,
        type: "IVA",
        year: next.year,
        month: next.month,
      },
    },
  });

  // Already dealt with: show the period after it instead of a solved deadline.
  if (filing && (filing.status === "SUBMITTED" || filing.status === "PAID")) {
    const followingMonth = next.month === 12 ? 1 : next.month + 1;
    const followingYear = next.month === 12 ? next.year + 1 : next.year;
    const following = await prisma.taxFiling.findUnique({
      where: {
        companyId_type_year_month: {
          companyId,
          type: "IVA",
          year: followingYear,
          month: followingMonth,
        },
      },
    });
    const dueDate = ivaDueDate(ruc, followingYear, followingMonth);
    if (!dueDate) return null;
    return {
      type: "IVA",
      year: followingYear,
      month: followingMonth,
      dueDate,
      daysRemaining: daysUntil(dueDate, now),
      overdue: false,
      status: following?.status ?? "DRAFT",
      filingId: following?.id ?? null,
    };
  }

  return {
    type: "IVA",
    year: next.year,
    month: next.month,
    dueDate: next.dueDate,
    daysRemaining: next.daysRemaining,
    overdue: false,
    status: filing?.status ?? "DRAFT",
    filingId: filing?.id ?? null,
  };
}
