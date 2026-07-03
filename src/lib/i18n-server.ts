import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, getDict, normalizeLocale, translate, type Locale } from "./i18n";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value ?? DEFAULT_LOCALE);
}

/** Server-side translator bound to the request locale. */
export async function getT() {
  const locale = await getLocale();
  const dict = getDict(locale);
  return {
    locale,
    dict,
    t: (key: string, vars?: Record<string, string | number>) => translate(dict, key, vars),
  };
}
