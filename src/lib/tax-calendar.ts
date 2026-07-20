/**
 * DNIT "Calendario Perpetuo de Vencimientos" (RG 38/2020): the monthly
 * F.120 due day depends on the LAST DIGIT of the taxpayer's RUC base
 * (before the DV). The declaration for period YYYY-MM falls due in the
 * FOLLOWING month.
 *
 * If the due day lands on a weekend it moves to the next business day.
 * National holidays are NOT modeled — the shifted date can still land on
 * a holiday; the UI labels the date "según calendario perpetuo" and never
 * presents it as legal advice.
 *
 * Pure functions; tests in tests/tax-calendar.test.ts.
 */

/** Due day of month by RUC last digit, per the perpetual calendar. */
const DUE_DAY_BY_DIGIT: Record<string, number> = {
  "0": 7,
  "1": 9,
  "2": 11,
  "3": 13,
  "4": 15,
  "5": 17,
  "6": 19,
  "7": 21,
  "8": 23,
  "9": 25,
};

export function rucLastDigit(ruc: string): string {
  const digits = ruc.replace(/\D/g, "");
  if (!digits) throw new Error(`RUC sin dígitos: ${ruc}`);
  return digits[digits.length - 1];
}

export function dueDayForRuc(ruc: string): number {
  return DUE_DAY_BY_DIGIT[rucLastDigit(ruc)];
}

/** Saturday/Sunday roll forward to Monday. Dates are UTC-based day math. */
export function nextBusinessDay(date: Date): Date {
  const d = new Date(date);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

/**
 * Due date of the F.120 for the period `year`-`month` (1-12): the
 * calendar day in the FOLLOWING month, weekend-shifted forward.
 */
export function f120DueDate(ruc: string, year: number, month: number): Date {
  const day = dueDayForRuc(ruc);
  return nextBusinessDay(new Date(Date.UTC(year, month, day)));
}

/** The period (previous month) whose declaration is pending as of `today`. */
export function previousPeriod(today: Date): { year: number; month: number } {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

/** Whole days from `today` until `due` (negative = overdue). UTC day math. */
export function daysUntil(today: Date, due: Date): number {
  const a = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const b = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}
