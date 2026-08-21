/**
 * Filing status guards — pure, client-safe, no Prisma import.
 *
 * `filing.ts` enforces these in the database layer; the `/taxes` UI imports
 * them to decide whether to even offer the reopen button. Keeping them in
 * their own module means a `"use client"` component can share the exact rule
 * the server enforces instead of restating it (PLAN Phase 5.10).
 */

/** Mirrors the Prisma `TaxFilingStatus` enum; `filing.ts` asserts they match. */
export type FilingStatus = "DRAFT" | "CLOSED" | "SUBMITTED" | "PAID";

/**
 * Statuses a filing may still be rewritten from.
 *
 * `DRAFT` and `CLOSED` are working states: the period has not been presented
 * to DNIT, so re-closing it (a fresh snapshot) or withdrawing it entirely is a
 * bookkeeping correction. `SUBMITTED` and `PAID` are declared facts — the
 * figures went to DNIT, so the snapshot behind them is frozen for good.
 */
export const MUTABLE_FILING_STATUSES: readonly FilingStatus[] = ["DRAFT", "CLOSED"];

/** Whether `reopenPeriod` may withdraw a filing in this status. */
export function canReopenFiling(status: FilingStatus): boolean {
  return MUTABLE_FILING_STATUSES.includes(status);
}

/** Whether `closePeriod` may write a new snapshot over a filing in this status. */
export function canOverwriteSnapshot(status: FilingStatus): boolean {
  return MUTABLE_FILING_STATUSES.includes(status);
}
