/**
 * Metadata and structured data for the public site (PLAN Phase 9.4).
 *
 * The JSON-LD builders omit every fact `firm.ts` does not have yet rather
 * than emitting an empty or invented value: structured data is a claim made
 * to a search engine about a real business, and a wrong one is worse than an
 * absent one.
 */

import type { Metadata } from "next";
import { marketingOrigin } from "../hosts";
import { COUNTRY, FIRM, LOCALE, addressLine } from "./firm";

/** Absolute canonical URL for a marketing path. */
export function canonicalUrl(path: string): string {
  return `${marketingOrigin()}${path === "/" ? "" : path}`;
}

/** Per-page metadata: title, description, canonical and OpenGraph in one call. */
export function pageMetadata(opts: {
  path: string;
  title: string;
  description: string;
}): Metadata {
  const url = canonicalUrl(opts.path);
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: FIRM.name,
      title: opts.title,
      description: opts.description,
      url,
      locale: LOCALE.replace("-", "_"),
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
    },
  };
}

type JsonLd = Record<string, unknown>;

/** Address node, only when there is a real address. */
function postalAddress(): JsonLd | undefined {
  if (!FIRM.address) return undefined;
  return {
    "@type": "PostalAddress",
    streetAddress: FIRM.address.street,
    addressLocality: FIRM.address.city,
    addressRegion: FIRM.address.department,
    addressCountry: COUNTRY,
    ...(FIRM.address.postalCode ? { postalCode: FIRM.address.postalCode } : {}),
  };
}

/**
 * The firm itself. `AccountingService` (a `LocalBusiness` subtype) once there
 * is an address to justify it; a plain `Organization` until then, because a
 * LocalBusiness without a location is exactly the thin claim search engines
 * discount.
 */
export function organizationJsonLd(): JsonLd {
  const address = postalAddress();
  return {
    "@context": "https://schema.org",
    "@type": address ? "AccountingService" : "Organization",
    "@id": `${marketingOrigin()}/#organization`,
    name: FIRM.name,
    url: marketingOrigin(),
    ...(FIRM.razonSocial ? { legalName: FIRM.razonSocial } : {}),
    ...(FIRM.email ? { email: FIRM.email } : {}),
    ...(FIRM.phoneDisplay ? { telephone: FIRM.phoneDisplay } : {}),
    ...(address ? { address } : {}),
    ...(FIRM.openingHours
      ? { openingHoursSpecification: FIRM.openingHours }
      : {}),
    ...(FIRM.foundedYear ? { foundingDate: String(FIRM.foundedYear) } : {}),
    areaServed: { "@type": "Country", name: COUNTRY },
    availableLanguage: LOCALE,
    knowsAbout: [
      "Facturación electrónica",
      "SIFEN",
      "Impuesto al Valor Agregado",
      "Formulario 120",
      "Impuesto a la Renta Personal",
    ],
  };
}

/** One offered service, tied back to the organization. */
export function serviceJsonLd(opts: {
  path: string;
  name: string;
  description: string;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: opts.name,
    description: opts.description,
    url: canonicalUrl(opts.path),
    serviceType: opts.name,
    provider: { "@id": `${marketingOrigin()}/#organization` },
    areaServed: { "@type": "Country", name: COUNTRY },
  };
}

export function faqJsonLd(
  faqs: { question: string; answer: string }[],
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

export function breadcrumbJsonLd(
  trail: { name: string; path: string }[],
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: canonicalUrl(step.path),
    })),
  };
}

/** Human-readable address for the footer; null when there is none. */
export { addressLine };
