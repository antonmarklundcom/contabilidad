import type { Metadata } from "next";
import { FIRM, organizationJsonLd } from "@/lib/marketing";
import { marketingOrigin } from "@/lib/hosts";
import { JsonLd } from "./json-ld";
import { SiteHeader } from "./_components/site-header";
import { SiteFooter } from "./_components/site-footer";

/**
 * The public site (PLAN Phase 9.3).
 *
 * Reached only by the middleware's host rewrite — `/marketing/...` is an
 * internal path, never a URL a visitor sees (the app host redirects out of
 * it, the marketing host redirects it to the canonical path).
 *
 * No session, no `getCompanyId()`, no app chrome: there is no company context
 * on the apex and nothing here may assume one. `data-site="marketing"` scopes
 * the entire visual system, so the app's palette and this one cannot collide.
 */
export const metadata: Metadata = {
  metadataBase: new URL(marketingOrigin()),
  // Overrides the root layout's app title template — the public site is the
  // firm, not the product.
  title: {
    default: `${FIRM.name} · Estudio contable en Paraguay`,
    template: `%s · ${FIRM.name}`,
  },
  // The root layout marks the application noindex. The public site is the
  // one place that must be indexable, so it says so explicitly.
  robots: { index: true, follow: true },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-site="marketing" className="flex min-h-screen flex-col">
      {/* One Organization node for the whole site; pages reference it by @id. */}
      <JsonLd data={organizationJsonLd()} />
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--m-surface)] focus:px-4 focus:py-2"
      >
        Saltar al contenido
      </a>
      <SiteHeader />
      <main id="contenido" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
