import type { Metadata } from "next";
import { FIRM, pageMetadata } from "@/lib/marketing";
import { Container, Section } from "../_components/ui";

export const metadata: Metadata = {
  ...pageMetadata({
    path: "/privacidad",
    title: "Privacidad",
    description:
      "Qué datos recibimos desde este sitio, para qué los usamos y con quién no los compartimos.",
  }),
  robots: { index: false, follow: true },
};

/**
 * Describes only what this site actually does today: a contact form that
 * sends an email, and no analytics or third-party trackers — because none are
 * installed. If any of that changes, this page changes with it.
 */
export default function PrivacidadPage() {
  return (
    <Section tone="paper" className="pt-14 sm:pt-20">
      <Container className="max-w-3xl px-0">
        <h1 className="m-display">Privacidad</h1>
        <div className="mt-10 space-y-8 text-[var(--m-ink-soft)] leading-relaxed">
          <section>
            <h2 className="m-h3 text-[var(--m-ink)]">Qué datos recibimos</h2>
            <p className="mt-2">
              Únicamente los que nos dejás en el formulario de contacto: nombre,
              empresa, correo, teléfono y el mensaje que escribís. No pedimos
              ningún otro dato para navegar el sitio.
            </p>
          </section>
          <section>
            <h2 className="m-h3 text-[var(--m-ink)]">Para qué los usamos</h2>
            <p className="mt-2">
              Para responder tu consulta y, si avanzamos, para preparar una
              propuesta de trabajo. No los usamos para enviarte publicidad ni
              los compartimos con terceros.
            </p>
          </section>
          <section>
            <h2 className="m-h3 text-[var(--m-ink)]">Cookies y medición</h2>
            <p className="mt-2">
              Este sitio no instala cookies de seguimiento ni servicios de
              analítica de terceros. Si eso cambiara, esta página lo diría
              antes.
            </p>
          </section>
          <section>
            <h2 className="m-h3 text-[var(--m-ink)]">Datos de clientes</h2>
            <p className="mt-2">
              La información contable de nuestros clientes se maneja en el
              sistema, en un ámbito separado de este sitio público, con accesos
              individuales y separación por empresa. Los documentos fiscales se
              conservan por el plazo de guarda legal que corresponde.
            </p>
          </section>
          <section>
            <h2 className="m-h3 text-[var(--m-ink)]">
              Cómo pedir la baja de tus datos
            </h2>
            <p className="mt-2">
              {FIRM.email
                ? `Escribinos a ${FIRM.email} y damos de baja lo que nos hayas enviado por este sitio, salvo lo que tengamos obligación legal de conservar.`
                : "Escribinos por los canales de contacto del sitio y damos de baja lo que nos hayas enviado, salvo lo que tengamos obligación legal de conservar."}
            </p>
          </section>
        </div>
      </Container>
    </Section>
  );
}
