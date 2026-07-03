import es from "../../locales/es.json";
import en from "../../locales/en.json";

export type Locale = "es" | "en";
export const LOCALES: Locale[] = ["es", "en"];
export const DEFAULT_LOCALE: Locale = "es";
export const LOCALE_COOKIE = "facturapy_locale";

export type Dict = typeof es;

const dicts: Record<Locale, Dict> = { es, en: en as Dict };

export function getDict(locale: Locale): Dict {
  return dicts[locale] ?? dicts.es;
}

/** Dot-path lookup with {var} interpolation. Returns the key when missing. */
export function translate(
  dict: Dict,
  key: string,
  vars?: Record<string, string | number>
): string {
  const parts = key.split(".");
  let node: unknown = dict;
  for (const p of parts) {
    if (node && typeof node === "object" && p in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[p];
    } else {
      return key;
    }
  }
  let str = typeof node === "string" ? node : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}

export function normalizeLocale(value: string | undefined | null): Locale {
  return value === "en" ? "en" : "es";
}

// ── Formatting ───────────────────────────────────────────────────────────────

const intlLocale = (locale: Locale) => (locale === "es" ? "es-PY" : "en-US");

/** PYG shows no decimals ("1.234.567"); other currencies show 2. */
export function formatMoney(
  amount: number | string,
  currency = "PYG",
  locale: Locale = "es"
): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  const digits = currency === "PYG" ? 0 : 2;
  const formatted = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
  if (currency === "PYG") return locale === "es" ? `${formatted} Gs.` : `Gs. ${formatted}`;
  return `${currency === "USD" ? "US$" : currency + " "}${formatted}`;
}

export function formatNumber(n: number | string, locale: Locale = "es", digits = 0): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(typeof n === "string" ? Number(n) : n);
}

export function formatDate(d: Date | string | null | undefined, locale: Locale = "es"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(
  d: Date | string | null | undefined,
  locale: Locale = "es"
): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function monthName(month: number, locale: Locale = "es"): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: "long" }).format(
    new Date(2024, month - 1, 15)
  );
}
