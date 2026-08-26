import Link from "next/link";
import {
  APP_URL,
  FIRM,
  NAV_PAGES,
  SERVICES,
  servicePath,
} from "@/lib/marketing";
import { Container } from "./ui";
import { PrimaryCta } from "./ui";

/**
 * Site header.
 *
 * The mobile menu is a native `<details>` — no client component, no
 * hydration, no layout shift. The whole marketing site ships zero JavaScript
 * of its own, which is most of the Core Web Vitals budget won for free.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--m-line)] bg-[var(--m-paper)]/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link href="/" className="font-semibold tracking-tight">
          {FIRM.name}
        </Link>

        <nav
          aria-label="Principal"
          className="hidden items-center gap-7 text-sm lg:flex"
        >
          {NAV_PAGES.map((page) => (
            <Link
              key={page.path}
              href={page.path}
              className="text-[var(--m-ink-soft)] hover:text-[var(--m-accent-ink)]"
            >
              {page.nav!.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <a
            href={APP_URL}
            className="text-sm text-[var(--m-ink-soft)] hover:text-[var(--m-accent-ink)]"
          >
            Acceso clientes
          </a>
          <PrimaryCta label="WhatsApp" fallbackLabel="Contacto" />
        </div>

        <details className="relative lg:hidden">
          <summary className="m-btn m-btn-ghost list-none px-3">Menú</summary>
          <div className="absolute right-0 top-12 w-64 rounded-xl border border-[var(--m-line)] bg-[var(--m-surface)] p-2 shadow-lg">
            {NAV_PAGES.map((page) => (
              <Link
                key={page.path}
                href={page.path}
                className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--m-raise)]"
              >
                {page.nav!.label}
              </Link>
            ))}
            <div className="my-2 border-t border-[var(--m-line)]" />
            {SERVICES.map((service) => (
              <Link
                key={service.slug}
                href={servicePath(service.slug)}
                className="block rounded-lg px-3 py-2 text-sm text-[var(--m-ink-soft)] hover:bg-[var(--m-raise)]"
              >
                {service.navLabel}
              </Link>
            ))}
            <div className="my-2 border-t border-[var(--m-line)]" />
            <a
              href={APP_URL}
              className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--m-raise)]"
            >
              Acceso clientes
            </a>
          </div>
        </details>
      </Container>
    </header>
  );
}
