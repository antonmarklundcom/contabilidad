/**
 * The `TaxFiling.month` column, and what it means.
 *
 * Pure and client-safe (no Prisma, no next-auth), like `filing-status.ts`, so
 * the UI formats a period with the same function the server stores it with.
 *
 * ## Why annual filings carry month 0 rather than NULL
 *
 * `TaxFiling` is unique on `(companyId, type, year, month)`. Postgres treats
 * NULLs as **distinct**, so while `month` was nullable that constraint deduped
 * monthly (IVA) filings and silently did nothing for annual (IRP) ones: two
 * IRP returns for the same company and year would both insert. Nothing wrote
 * IRP rows before Phase 7, so no duplicate was ever created — but Phase 7 is
 * exactly the code that would have created them.
 *
 * Of the two fixes the schema comment weighed, the sentinel is the one that
 * survives this repo's CI: a partial unique index (`WHERE month IS NULL`) is
 * not expressible in the Prisma schema, so `prisma migrate diff` would report
 * it as drift on every build. `NULLS NOT DISTINCT` (PG 15+) is not expressible
 * either, and Prisma's diff does not model the clause — meaning the constraint
 * could be silently dropped by a later `migrate dev` without CI noticing.
 * Money-path code does not get to depend on a tool failing to notice.
 *
 * So `month` is NOT NULL and annual filings store `ANNUAL_MONTH` (0), a value
 * no real month can take. The existing unique constraint then dedupes both
 * kinds with no special cases anywhere.
 */

/** `TaxFiling.month` for an obligation that covers a whole fiscal year. */
export const ANNUAL_MONTH = 0;

/** Whether a stored `month` denotes a whole fiscal year rather than a month. */
export function isAnnualPeriod(month: number): boolean {
  return month === ANNUAL_MONTH;
}

/**
 * The value to store in `TaxFiling.month`.
 *
 * Accepts the nullable shape callers used before the column became NOT NULL,
 * so "no month" keeps meaning "annual" at every boundary.
 */
export function monthColumn(month: number | null | undefined): number {
  return month ?? ANNUAL_MONTH;
}

/**
 * The stored `month` as a fiscal month, or null when the filing is annual.
 * The inverse of `monthColumn`.
 */
export function periodMonth(month: number): number | null {
  return isAnnualPeriod(month) ? null : month;
}

/**
 * How a period is written everywhere in the UI, the CSV export and the PDFs:
 * `2026-05` for a month, `2026` for a fiscal year.
 */
export function periodLabel(year: number, month: number): string {
  return isAnnualPeriod(month) ? String(year) : `${year}-${String(month).padStart(2, "0")}`;
}
