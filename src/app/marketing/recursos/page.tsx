import type { Metadata } from "next";
import Link from "next/link";
import {
  GUIDES,
  breadcrumbJsonLd,
  guidePath,
  pageMetadata,
} from "@/lib/marketing";
import { JsonLd } from "../json-ld";
import { ClosingCta, Eyebrow, Section } from "../_components/ui";

export const metadata: Metadata = pageMetadata({
  path: "/recursos",
  title: "Recursos",
  description:
    "Explicaciones claras sobre facturación electrónica, el Formulario 120 y los comprobantes electrónicos en Paraguay, escritas para quien no es contador.",
});

export default function RecursosPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Inicio", path: "/" },
          { name: "Recursos", path: "/recursos" },
        ])}
      />

      <Section tone="paper" className="pt-14 sm:pt-20">
        <div className="max-w-3xl">
          <Eyebrow>Recursos</Eyebrow>
          <h1 className="m-display">
            Lo que explicamos seguido, escrito una vez
          </h1>
          <p className="m-lead mt-6">
            Preguntas que nos hacen todas las semanas, respondidas en castellano
            y sin citar resoluciones de memoria. Si tu caso tiene una vuelta
            particular, escribinos.
          </p>
        </div>
      </Section>

      <Section tone="surface">
        <div className="grid gap-4">
          {GUIDES.map((guide) => (
            <Link
              key={guide.slug}
              href={guidePath(guide.slug)}
              className="m-card m-card-link block p-7 sm:p-8"
            >
              <p className="m-eyebrow">{guide.readingMinutes} min de lectura</p>
              <h2 className="m-h3 mt-2">{guide.title}</h2>
              <p className="mt-2.5 text-[var(--m-ink-soft)]">{guide.summary}</p>
              <span className="mt-5 inline-block text-sm font-medium text-[var(--m-accent-ink)]">
                Leer →
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <ClosingCta
        title="¿Tu duda no está acá?"
        lead="Preguntanos directamente. Si la pregunta se repite, termina siendo el próximo recurso de esta página."
        message="Hola, tengo una consulta sobre mis obligaciones."
      />
    </>
  );
}
