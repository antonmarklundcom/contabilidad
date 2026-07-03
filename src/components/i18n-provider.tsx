"use client";

import { createContext, useContext, useMemo } from "react";
import {
  getDict,
  translate,
  formatMoney,
  formatNumber,
  formatDate,
  formatDateTime,
  type Locale,
} from "@/lib/i18n";

interface I18nContextValue {
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
  money: (amount: number | string, currency?: string) => string;
  num: (n: number | string, digits?: number) => string;
  date: (d: Date | string | null | undefined) => string;
  dateTime: (d: Date | string | null | undefined) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo<I18nContextValue>(() => {
    const dict = getDict(locale);
    return {
      locale,
      t: (key, vars) => translate(dict, key, vars),
      money: (amount, currency = "PYG") => formatMoney(amount, currency, locale),
      num: (n, digits = 0) => formatNumber(n, locale, digits),
      date: (d) => formatDate(d, locale),
      dateTime: (d) => formatDateTime(d, locale),
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
