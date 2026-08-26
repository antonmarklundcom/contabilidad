import type { Metadata } from "next";
import Link from "next/link";
import {
  SERVICES,
  breadcrumbJsonLd,
  pageMetadata,
  servicePath,
} from "@/lib/marketing";
import { JsonLd } from "../json-ld";
import { ClosingCta, Section, TickList } from "../_components/ui";

export const metadata: Metadata = pageMetadata({
  path: "/servicios",
  title: "Servicios contables e impositivos",
  description:
    "Facturación electrónica SIFEN, libros de IVA, Formulario 120, IRP, contabilidad mensual y conciliación de comprobantes. Cada servicio se puede contratar solo.",
});

export default function ServiciosPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Inicio", path: "/" },
          { name: "Servicios", path: "/servicios" },
        ])}
      />

      <Section tone="paper" className="pt-14 sm:pt-20">
        <div className="max-w-3xl">
          <p className="m-eyebrow mb-3">Servicios</p>
          <h1 className="m-display">
            Todo lo que va del comprobante a la declaración
          </h1>
          <p className="m-lead mt-6">
            Podés contratar el trabajo mensual completo o un encargo puntual:
            poner los libros al día, ordenar la emisión electrónica o revisar un
            período antes de que lo revise DNIT.
          </p>
        </div>
      </Section>

      <Section tone="surface">
        <div className="grid gap-4">
          {SERVICES.map((service) => (
            <Link
              key={service.slug}
              href={servicePath(service.slug)}
              className="m-card m-card-link grid gap-6 p-7 sm:grid-cols-[1.1fr_0.9fr] sm:p-8"
            >
              <div>
                <h2 className="m-h3">{service.title}</h2>
                <p className="mt-2.5 text-[var(--m-ink-soft)]">
                  {service.summary}
                </p>
                <span className="mt-5 inline-block text-sm font-medium text-[var(--m-accent-ink)]">
                  Ver el servicio →
                </span>
              </div>
              <TickList
                className="text-sm"
                items={service.includes.slice(0, 3)}
              />
            </Link>
          ))}
        </div>
      </Section>

      <ClosingCta
        title="¿No sabés cuál de todos necesitás?"
        lead="Contanos qué obligaciones tenés y cómo trabajás hoy. En una conversación queda claro qué hace falta y qué no."
        message="Hola, quiero saber qué servicios necesito para mi empresa."
      />
    </>
  );
}
