/**
 * The public site's own vocabulary (PLAN Phase 9.3/9.4).
 *
 * Deliberately separate from `locales/*.json`: the marketing pages are
 * Spanish-first firm copy with no language switch and no session, and folding
 * them into the app's dictionaries would make every app string a page the
 * apex could render. Only the seam is here — the real copy is a separate
 * task (PLAN Phase 9, "Not in scope").
 */

import { marketingOrigin } from "./hosts";

export type MarketingPage = {
  /** Public path on the marketing host, not the internal `/marketing/...` one. */
  path: string;
  /** Sitemap weight; the home page leads. */
  priority: string;
};

export const MARKETING_PAGES: readonly MarketingPage[] = [
  { path: "/", priority: "1.0" },
  { path: "/servicios", priority: "0.8" },
  { path: "/sobre-nosotros", priority: "0.6" },
  { path: "/contacto", priority: "0.8" },
];

/** Business identity for both metadata and JSON-LD. Placeholder until copy lands. */
export const FIRM = {
  name: "Contador.com.py",
  /** TODO(copy): real positioning line from whoever writes the marketing copy. */
  tagline: "Estudio contable en Paraguay",
  areaServed: "PY",
  language: "es-PY",
} as const;

/** Absolute canonical URL for a marketing path. */
export function canonicalUrl(path: string): string {
  return `${marketingOrigin()}${path === "/" ? "" : path}`;
}

/**
 * `AccountingService` JSON-LD (PLAN Phase 9.4).
 *
 * A stub on purpose: no address, no telephone, no rating, no opening hours.
 * Structured data is a claim to Google about a real business — inventing the
 * fields now would be exactly the fabrication the project refuses elsewhere.
 * They get filled in with the real ones when the copy task supplies them.
 */
export function accountingServiceJsonLd(page: { path: string; name: string; description: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "AccountingService",
    name: FIRM.name,
    description: page.description,
    url: canonicalUrl(page.path),
    areaServed: { "@type": "Country", name: FIRM.areaServed },
    availableLanguage: FIRM.language,
  };
}
