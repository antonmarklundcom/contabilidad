/**
 * Month-end pre-computation of the F.120 draft (PLAN Phase 5.7, STRATEGY's
 * "zero minutes beats four").
 *
 * Once a month ends, the draft for it is computed and stored as a `DRAFT`
 * `TaxFiling` so it is *already waiting* when the user logs in, instead of
 * being computed on first page view. The snapshot a DRAFT row carries is a
 * convenience copy, not a declared figure: `getPeriodClose()` ignores DRAFT
 * rows, so nothing downstream treats it as signed off, and `closePeriod()`
 * overwrites it with the figures as of the human's sign-off.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { buildForm120 } from "@/lib/form120";
import { ivaDueDateForCompany } from "@/lib/tax/filing";

/** The period that most recently ended, relative to `now`. */
export function lastClosedPeriod(now: Date = new Date()): { year: number; month: number } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed "this month" == 1-indexed previous
  return month === 0 ? { year: year - 1, month: 12 } : { year, month };
}

export interface PrecomputeOptions {
  /** Restrict the run to one company. The cron runs every company. */
  companyId?: string;
}

export interface PrecomputeResult {
  /** How many companies got a fresh draft on this run. */
  computed: number;
}

/**
 * Ensures every company has a draft for the period that just ended.
 *
 * Idempotent: a company whose period already has a filing row — draft,
 * closed, submitted or paid — is skipped, and a row created concurrently
 * loses to the unique constraint rather than overwriting anything.
 */
export async function precomputeMonthEndDrafts(
  now: Date = new Date(),
  options: PrecomputeOptions = {}
): Promise<PrecomputeResult> {
  const { year, month } = lastClosedPeriod(now);
  const companies = await prisma.company.findMany({
    where: options.companyId ? { id: options.companyId } : {},
    select: { id: true },
  });
  let computed = 0;

  for (const { id: companyId } of companies) {
    const existing = await prisma.taxFiling.findUnique({
      where: { companyId_type_year_month: { companyId, type: "IVA", year, month } },
    });
    if (existing) continue;

    const snapshot = await buildForm120(companyId, year, month);
    const dueDate = await ivaDueDateForCompany(companyId, year, month);
    try {
      await prisma.taxFiling.create({
        data: {
          companyId,
          type: "IVA",
          year,
          month,
          status: "DRAFT",
          dueDate,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
      computed++;
    } catch (err) {
      // Another runner got there first: its row is as good as ours.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }

  return { computed };
}
