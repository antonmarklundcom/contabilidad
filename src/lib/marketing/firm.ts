/**
 * The firm's own facts (PLAN Phase 9.3).
 *
 * Everything a visitor could act on — a number they would call, an address
 * they would drive to, a matrícula they could verify — lives here and nowhere
 * else, so filling it in is one edit and forgetting to is visible.
 *
 * **Nothing in this file may be invented.** `CLAUDE.md`'s anti-fabrication
 * rule is not decoration on a marketing site: a fake address is what Google
 * penalises and a fake matrícula is what a client sues over. A field that is
 * still `null` is *omitted* from the page and from the JSON-LD rather than
 * filled with a plausible placeholder — `pending()` below is the only way to
 * ask whether it can be shown.
 */

export type FirmFacts = {
  /** Legal/commercial name as it should read on the site. */
  name: string;
  /** Razón social, when it differs from the trading name. */
  razonSocial: string | null;
  ruc: string | null;
  /** E.164, digits only — used for the wa.me link. */
  whatsapp: string | null;
  /** As a visitor should read it, e.g. "+595 21 000 000". */
  phoneDisplay: string | null;
  email: string | null;
  address: {
    street: string;
    city: string;
    department: string;
    postalCode: string | null;
  } | null;
  /** The contador matriculado who signs the work, and their matrícula. */
  contador: { name: string; matricula: string } | null;
  /** Year the firm started operating. Not a claim we can round up. */
  foundedYear: number | null;
  /** Opening hours as schema.org strings, e.g. "Mo-Fr 08:00-17:00". */
  openingHours: string[] | null;
};

/**
 * ⚠️ TODO(owner): replace every `null` with the real value before launch.
 * Until then the site renders honestly without them — see `pending()`.
 */
export const FIRM: FirmFacts = {
  name: "Contador.com.py",
  razonSocial: null,
  ruc: null,
  whatsapp: null,
  phoneDisplay: null,
  email: null,
  address: null,
  contador: null,
  foundedYear: null,
  openingHours: null,
};

/** Language and market. These are not pending — they are what the site is. */
export const LOCALE = "es-PY";
export const COUNTRY = "PY";

/** The application, on its own host (PLAN Phase 9.1). */
export const APP_URL = "https://sistema.contador.com.py";

/** Which contact facts are still missing, for the launch checklist. */
export function pending(): (keyof FirmFacts)[] {
  return (Object.keys(FIRM) as (keyof FirmFacts)[]).filter(
    (key) => FIRM[key] === null,
  );
}

/** True when the firm can be contacted at all — gates every contact CTA. */
export function contactable(): boolean {
  return Boolean(FIRM.whatsapp || FIRM.phoneDisplay || FIRM.email);
}

/** wa.me link with a prefilled message, or null when there is no number yet. */
export function whatsappUrl(message?: string): string | null {
  if (!FIRM.whatsapp) return null;
  const digits = FIRM.whatsapp.replace(/\D/g, "");
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${query}`;
}

/** Address on one line, or null. */
export function addressLine(): string | null {
  if (!FIRM.address) return null;
  const { street, city, department } = FIRM.address;
  return `${street}, ${city}, ${department}`;
}
