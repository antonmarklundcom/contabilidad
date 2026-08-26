import type { Metadata } from "next";
import Link from "next/link";
import { FIRM, MARKETING_PAGES } from "@/lib/marketing";
import { marketingOrigin } from "@/lib/hosts";

/**
 * The public site (PLAN Phase 9.3).
 *
 * Reached only by the middleware's host rewrite — `/marketing/...` is an
 * internal path, never a URL a visitor sees (the app host redirects out of
 * it, the marketing host redirects it to the canonical path).
 *
 * No session, no `getCompanyId()`, no app chrome: there is no company context
 * on the apex and nothing here may assume one.
 */
export const metadata: Metadata = {
  metadataBase: new URL(marketingOrigin()),
  // Overrides the root layout's app title template — the public site is the
  // firm, not the product.
  title: { default: FIRM.name, template: `%s · ${FIRM.name}` },
  // The root layout marks the application noindex. The public site is the
  // one place that must be indexable, so it says so explicitly.
  robots: { index: true, follow: true },
};

/** TODO(copy): navigation labels ship with the marketing copy task. */
const NAV = MARKETING_PAGES.filter((page) => page.path !== "/");

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="border-b">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4 text-sm">
          <Link href="/" className="font-semibold">
            {FIRM.name}
          </Link>
          <ul className="flex gap-4">
            {NAV.map((page) => (
              <li key={page.path}>
                <Link href={page.path}>{page.path.replace("/", "")}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-12">{children}</main>
      <footer className="border-t px-6 py-8 text-center text-sm text-neutral-500">
        {FIRM.name}
      </footer>
    </div>
  );
}
