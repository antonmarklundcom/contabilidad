/**
 * SET / DNIT perpetual tax calendar (calendario perpetuo de vencimientos).
 *
 * Filing and payment due dates in Paraguay are keyed by the LAST DIGIT of the
 * taxpayer's RUC, *excluding* the check digit (dígito verificador). The same
 * digit→day table drives IVA (Formulario 120, monthly) and IRP (annual).
 *
 * Pure functions only — no DB, no I/O, no `Date.now()` except where a caller
 * passes a reference date in. Money-path code: a wrong due date makes a client
 * file late, so this module is fixture-tested like `money.ts` and `ruc.ts`.
 *
 * Sources (consulted 2026-08-04):
 *   - DNIT, "Calendario Perpetuo continúa vigente para el IVA, IRP y Rentas"
 *     https://www.dnit.gov.py/en/web/portal-institucional/w/calendario-perpetuo-continua-vigente-para-el-iva-irp-y-rentas
 *   - DNIT, "Vencimiento Ley Nº 6380/19"
 *     https://www.dnit.gov.py/en/web/portal-institucional/w/vencimiento-ley-n-6380/19
 *   - Establishing rules: Resolución General N° 01/2007, reaffirmed by
 *     Resolución General N° 38/2020.
 *
 * ⚠️ UNVERIFIED AGAINST THE PRIMARY DOCUMENT. The table below was corroborated
 * across four independent searches (DNIT portal summaries, La Nación, ABC
 * Color, ImpuestosPy), all agreeing on `día = 7 + 2 × dígito`. It was NOT read
 * off a DNIT PDF directly: this build environment's network policy denies
 * dnit.gov.py at the proxy, so the primary source could not be fetched.
 * Confirm `PERPETUAL_CALENDAR` against the current DNIT resolution before
 * relying on it in production.
 */
import { splitRuc } from "@/lib/sifen/ruc";


/**
 * RUC last digit → day of month the obligation falls due.
 *
 * This is deliberately a flat data table rather than the arithmetic
 * `7 + 2 * digit` that happens to describe it today: when SET moves a single
 * digit in a future resolution, that must stay a one-line edit here and not a
 * rewrite of a formula. Index = RUC last digit.
 */
export const PERPETUAL_CALENDAR: readonly number[] = [
  7, // 0
  9, // 1
  11, // 2
  13, // 3
  15, // 4
  17, // 5
  19, // 6
  21, // 7
  23, // 8
  25, // 9
];

/** The month (1-12) in which the previous fiscal year's IRP return falls due. */
export const IRP_FILING_MONTH = 3; // March

export type FilingType = "IVA" | "IRP";

/**
 * Fixed-date Paraguayan national holidays (month, day), per Ley N° 1723/2001
 * and its amendments. Movable Easter-derived holidays are computed separately;
 * see `holidaysForYear`.
 *
 * NOT included, deliberately: decree-declared asuetos and one-off holiday
 * transfers ("feriados trasladables"), which the Executive sets year by year
 * and which are therefore not perpetual. Callers that know about one pass it
 * through `options.extraHolidays`.
 */
const FIXED_HOLIDAYS: readonly [month: number, day: number][] = [
  [1, 1], // Año Nuevo
  [3, 1], // Día de los Héroes (Cerro Corá)
  [5, 1], // Día del Trabajador
  [5, 14], // Independencia Nacional
  [5, 15], // Independencia Nacional
  [6, 12], // Paz del Chaco
  [8, 15], // Fundación de Asunción
  [9, 29], // Victoria de Boquerón
  [12, 8], // Virgen de Caacupé
  [12, 25], // Navidad
];

export interface DueDateOptions {
  /**
   * Extra non-working days to honour, as `YYYY-MM-DD` strings. Use for
   * decree-declared asuetos and holiday transfers, which are not perpetual and
   * so cannot be derived. Days listed here are treated exactly like a holiday.
   */
  extraHolidays?: readonly string[];
  /**
   * When false, the raw calendar day is returned without rolling weekends and
   * holidays forward. Default true.
   */
  observeNonWorkingDays?: boolean;
}

/** Formats a UTC date as `YYYY-MM-DD`. */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Builds a UTC midnight Date. Month is 1-12. */
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Easter Sunday (Gregorian, Meeus/Jones/Butcher algorithm), as a UTC date.
 * Paraguay's Jueves Santo and Viernes Santo derive from it.
 */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month, day);
}

/** Every statutory national holiday in `year`, as `YYYY-MM-DD` strings. */
export function holidaysForYear(year: number): string[] {
  const days = FIXED_HOLIDAYS.map(([m, d]) => toIsoDate(utcDate(year, m, d)));
  const easter = easterSunday(year);
  // Jueves Santo (-3) and Viernes Santo (-2). Easter Sunday itself is a Sunday
  // and so already non-working.
  for (const offset of [-3, -2]) {
    const d = new Date(easter);
    d.setUTCDate(d.getUTCDate() + offset);
    days.push(toIsoDate(d));
  }
  return days;
}

function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Rolls `date` forward to the next working day when it lands on a Saturday,
 * Sunday or national holiday.
 *
 * This is the rule DNIT states for the perpetual calendar: "si la fecha de
 * vencimiento coincide con un día inhábil, se traslada al día hábil siguiente."
 * It always moves *forward*, never back, so the taxpayer never loses a day.
 */
export function nextWorkingDay(date: Date, extraHolidays: readonly string[] = []): Date {
  const extra = new Set(extraHolidays);
  const d = new Date(date);
  // Holidays are cached per year; the loop can cross a year boundary
  // (e.g. a 25 December due date rolling into January).
  let year = d.getUTCFullYear();
  let holidays = new Set(holidaysForYear(year));
  // A run of non-working days is at most a few days long; the bound is a
  // guard against a pathological holiday table, not an expected path.
  for (let guard = 0; guard < 30; guard++) {
    if (d.getUTCFullYear() !== year) {
      year = d.getUTCFullYear();
      holidays = new Set(holidaysForYear(year));
    }
    const iso = toIsoDate(d);
    if (!isWeekend(d) && !holidays.has(iso) && !extra.has(iso)) return d;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

/**
 * The RUC's last digit, ignoring the check digit.
 *
 * Two input shapes are accepted: a hyphenated RUC ("80069563-1"), split by
 * `splitRuc` so the DV is discarded, and a bare RUC body ("80069563"), whose
 * own last digit is the key. A run-together "800695631" is intentionally read
 * as a body — there is no way to tell a DV from a body digit without the
 * hyphen, and guessing would silently produce the wrong due date.
 */
export function rucLastDigit(ruc: string): number | null {
  const trimmed = ruc.trim();
  if (!trimmed) return null;
  // `splitRuc` treats the hyphen as optional, so it would read a bare body's
  // last digit as a DV and strip it. Delegate only when a hyphen is present.
  const body = trimmed.includes("-") ? splitRuc(trimmed)?.ruc : trimmed;
  if (!body || !/^[0-9]{1,8}$/.test(body)) return null;
  return Number(body[body.length - 1]);
}

/** The due day of month for a RUC, or null when the RUC is unparseable. */
export function dueDayForRuc(ruc: string): number | null {
  const digit = rucLastDigit(ruc);
  if (digit === null) return null;
  return PERPETUAL_CALENDAR[digit];
}

/**
 * Due date for the monthly IVA return (Formulario 120) covering `year`/`month`.
 *
 * IVA is filed in arrears: the period's return falls due in the FOLLOWING
 * month, on the day the perpetual calendar assigns to the RUC. December's
 * period therefore falls due in January of the next year.
 *
 * Returns null when the RUC cannot be parsed — callers must handle that rather
 * than get a silently wrong date.
 */
export function ivaDueDate(
  ruc: string,
  year: number,
  month: number,
  options: DueDateOptions = {}
): Date | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(year)) return null;
  const day = dueDayForRuc(ruc);
  if (day === null) return null;

  const dueMonth = month === 12 ? 1 : month + 1;
  const dueYear = month === 12 ? year + 1 : year;
  const raw = utcDate(dueYear, dueMonth, day);
  return options.observeNonWorkingDays === false
    ? raw
    : nextWorkingDay(raw, options.extraHolidays);
}

/**
 * Due date for the annual IRP return covering fiscal year `year`.
 *
 * Filed in March of the following calendar year, on the RUC's calendar day.
 */
export function irpDueDate(
  ruc: string,
  year: number,
  options: DueDateOptions = {}
): Date | null {
  if (!Number.isInteger(year)) return null;
  const day = dueDayForRuc(ruc);
  if (day === null) return null;

  const raw = utcDate(year + 1, IRP_FILING_MONTH, day);
  return options.observeNonWorkingDays === false
    ? raw
    : nextWorkingDay(raw, options.extraHolidays);
}

/**
 * Whole days from `from` to `due`, counting by calendar date rather than
 * elapsed hours so a due date "today" is 0 and "tomorrow" is 1 regardless of
 * the time of day. Negative once the date has passed.
 */
export function daysUntil(due: Date, from: Date = new Date()): number {
  const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const fromUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.round((dueUtc - fromUtc) / 86_400_000);
}

export interface NextFiling {
  type: FilingType;
  /** Fiscal year the filing covers. */
  year: number;
  /** Fiscal month the filing covers; absent for IRP. */
  month?: number;
  dueDate: Date;
  daysRemaining: number;
}

/**
 * The next IVA filing due for a RUC as of `from` — i.e. the earliest monthly
 * period whose due date has not yet passed.
 *
 * Walks back from the period containing `from`: the current month's period is
 * not yet filable, last month's usually is, and once its due date passes the
 * answer becomes this month's period. Returns null on an unparseable RUC.
 */
export function nextIvaFiling(
  ruc: string,
  from: Date = new Date(),
  options: DueDateOptions = {}
): NextFiling | null {
  if (dueDayForRuc(ruc) === null) return null;

  // Start at the period that closed most recently and walk forward until a due
  // date is still in the future. Two iterations suffice in practice; the bound
  // covers a caller passing a `from` far in the past.
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth(); // 0-indexed "now" == 1-indexed previous month
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  for (let guard = 0; guard < 24; guard++) {
    const dueDate = ivaDueDate(ruc, year, month, options);
    if (!dueDate) return null;
    const daysRemaining = daysUntil(dueDate, from);
    if (daysRemaining >= 0) {
      return { type: "IVA", year, month, dueDate, daysRemaining };
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return null;
}
