import type { Metadata } from "next";
import {
  FIRM,
  addressLine,
  breadcrumbJsonLd,
  contactable,
  pageMetadata,
  whatsappUrl,
} from "@/lib/marketing";
import { smtpConfigured } from "@/lib/mailer";
import { JsonLd } from "../json-ld";
import { Eyebrow, Section, TickList } from "../_components/ui";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = pageMetadata({
  path: "/contacto",
  title: "Contacto",
  description:
    "Escribinos por WhatsApp, por correo o dejanos tu consulta en el formulario. Contanos qué obligaciones tenés y qué necesitás resolver.",
});

export default function ContactoPage() {
  const wa = whatsappUrl("Hola, quiero hacer una consulta contable.");
  const address = addressLine();
  // The form is only shown when a message could actually reach someone.
  const formUsable = Boolean(FIRM.email) && smtpConfigured();

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Inicio", path: "/" },
          { name: "Contacto", path: "/contacto" },
        ])}
      />

      <Section tone="paper" className="pt-14 sm:pt-20">
        <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <Eyebrow>Contacto</Eyebrow>
            <h1 className="m-display">Contanos tu caso</h1>
            <p className="m-lead mt-6 max-w-xl">
              Cuanto más concreto, mejor: qué obligaciones tenés vigentes,
              cuántos comprobantes manejás por mes y qué te está costando más
              tiempo hoy.
            </p>

            <dl className="mt-10 space-y-6">
              {wa ? (
                <div>
                  <dt className="m-eyebrow">WhatsApp</dt>
                  <dd className="mt-1">
                    <a
                      href={wa}
                      rel="noopener"
                      className="text-lg hover:text-[var(--m-accent-ink)]"
                    >
                      {FIRM.whatsapp}
                    </a>
                  </dd>
                </div>
              ) : null}
              {FIRM.phoneDisplay ? (
                <div>
                  <dt className="m-eyebrow">Teléfono</dt>
                  <dd className="mt-1">
                    <a
                      href={`tel:${FIRM.phoneDisplay.replace(/\s/g, "")}`}
                      className="text-lg hover:text-[var(--m-accent-ink)]"
                    >
                      {FIRM.phoneDisplay}
                    </a>
                  </dd>
                </div>
              ) : null}
              {FIRM.email ? (
                <div>
                  <dt className="m-eyebrow">Correo</dt>
                  <dd className="mt-1">
                    <a
                      href={`mailto:${FIRM.email}`}
                      className="text-lg hover:text-[var(--m-accent-ink)]"
                    >
                      {FIRM.email}
                    </a>
                  </dd>
                </div>
              ) : null}
              {address ? (
                <div>
                  <dt className="m-eyebrow">Dirección</dt>
                  <dd className="mt-1 text-lg">{address}</dd>
                </div>
              ) : null}
              {FIRM.openingHours ? (
                <div>
                  <dt className="m-eyebrow">Horario</dt>
                  <dd className="mt-1 text-[var(--m-ink-soft)]">
                    {FIRM.openingHours.join(" · ")}
                  </dd>
                </div>
              ) : null}
            </dl>

            {!contactable() ? (
              <p className="mt-10 rounded-lg border border-dashed border-[var(--m-line)] p-4 text-sm text-[var(--m-muted)]">
                TODO(owner): cargar WhatsApp, teléfono, correo y dirección en{" "}
                <code>src/lib/marketing/firm.ts</code>. Hasta entonces esta
                página no muestra datos de contacto, en lugar de mostrar datos
                inventados.
              </p>
            ) : null}
          </div>

          <div>
            {formUsable ? (
              <ContactForm />
            ) : (
              <div className="m-card p-7">
                <h2 className="m-h3">Escribinos directamente</h2>
                <p className="mt-2 text-[var(--m-ink-soft)]">
                  El formulario se habilita cuando esté configurado el correo
                  del estudio. Mientras tanto, el WhatsApp es la vía más rápida.
                </p>
                <TickList
                  className="mt-5 text-sm"
                  items={[
                    "Respondemos en horario laboral",
                    "Una primera conversación no tiene costo",
                    "No compartimos tus datos con terceros",
                  ]}
                />
              </div>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}
