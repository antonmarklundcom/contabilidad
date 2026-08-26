import Link from "next/link";
import {
  APP_URL,
  FIRM,
  NAV_PAGES,
  SERVICES,
  addressLine,
  servicePath,
  whatsappUrl,
} from "@/lib/marketing";
import { Container } from "./ui";

/**
 * Footer.
 *
 * Every contact line is conditional: a firm fact that `firm.ts` does not have
 * is simply not rendered. The alternative — a plausible-looking placeholder
 * phone number — is the kind of thing that ships to production and gets
 * called.
 */
export function SiteFooter() {
  const wa = whatsappUrl();
  const address = addressLine();
  const year = new Date().getFullYear();

  return (
    <footer className="m-rule bg-[var(--m-surface)] py-14">
      <Container>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-semibold">{FIRM.name}</p>
            <p className="mt-2 max-w-xs text-sm text-[var(--m-ink-soft)]">
              Servicios contables e impositivos en Paraguay.
            </p>
            {FIRM.contador ? (
              <p className="mt-3 text-sm text-[var(--m-muted)]">
                {FIRM.contador.name} · Mat. {FIRM.contador.matricula}
              </p>
            ) : null}
          </div>

          <nav aria-label="Servicios">
            <p className="text-sm font-medium">Servicios</p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--m-ink-soft)]">
              {SERVICES.map((service) => (
                <li key={service.slug}>
                  <Link
                    href={servicePath(service.slug)}
                    className="hover:text-[var(--m-accent-ink)]"
                  >
                    {service.navLabel}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Secciones">
            <p className="text-sm font-medium">El estudio</p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--m-ink-soft)]">
              {NAV_PAGES.filter((page) => page.path !== "/servicios").map(
                (page) => (
                  <li key={page.path}>
                    <Link
                      href={page.path}
                      className="hover:text-[var(--m-accent-ink)]"
                    >
                      {page.nav!.label}
                    </Link>
                  </li>
                ),
              )}
              <li>
                <Link
                  href="/recursos"
                  className="hover:text-[var(--m-accent-ink)]"
                >
                  Recursos
                </Link>
              </li>
              <li>
                <a href={APP_URL} className="hover:text-[var(--m-accent-ink)]">
                  Acceso clientes
                </a>
              </li>
            </ul>
          </nav>

          <div>
            <p className="text-sm font-medium">Contacto</p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--m-ink-soft)]">
              {wa ? (
                <li>
                  <a
                    href={wa}
                    rel="noopener"
                    className="hover:text-[var(--m-accent-ink)]"
                  >
                    WhatsApp
                  </a>
                </li>
              ) : null}
              {FIRM.phoneDisplay ? (
                <li>
                  <a
                    href={`tel:${FIRM.phoneDisplay.replace(/\s/g, "")}`}
                    className="hover:text-[var(--m-accent-ink)]"
                  >
                    {FIRM.phoneDisplay}
                  </a>
                </li>
              ) : null}
              {FIRM.email ? (
                <li>
                  <a
                    href={`mailto:${FIRM.email}`}
                    className="hover:text-[var(--m-accent-ink)]"
                  >
                    {FIRM.email}
                  </a>
                </li>
              ) : null}
              {address ? <li>{address}</li> : null}
              {!wa && !FIRM.phoneDisplay && !FIRM.email ? (
                <li>
                  <Link
                    href="/contacto"
                    className="hover:text-[var(--m-accent-ink)]"
                  >
                    Formas de contacto
                  </Link>
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="m-rule mt-12 flex flex-col gap-3 pt-6 text-sm text-[var(--m-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {FIRM.name}
            {FIRM.ruc ? ` · RUC ${FIRM.ruc}` : ""}
          </p>
          <Link href="/privacidad" className="hover:text-[var(--m-accent-ink)]">
            Privacidad
          </Link>
        </div>
      </Container>
    </footer>
  );
}
