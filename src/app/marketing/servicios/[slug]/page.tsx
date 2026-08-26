import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  SERVICES,
  breadcrumbJsonLd,
  faqJsonLd,
  pageMetadata,
  serviceBySlug,
  serviceJsonLd,
  servicePath,
} from "@/lib/marketing";
import { JsonLd } from "../../json-ld";
import {
  ClosingCta,
  Container,
  Faqs,
  PrimaryCta,
  Section,
  SectionHeading,
  Steps,
  TickList,
} from "../../_components/ui";

/**
 * One page per service, generated from `services.ts`.
 *
 * Data-driven rather than seven hand-written files so the hub cards, the
 * sitemap, the navigation and the structured data cannot drift out of sync
 * with the page a visitor actually lands on.
 */
export function generateStaticParams() {
  return SERVICES.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const service = serviceBySlug((await params).slug);
  if (!service) return {};
  return pageMetadata({
    path: servicePath(service.slug),
    title: service.metaTitle,
    description: service.metaDescription,
  });
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const service = serviceBySlug((await params).slug);
  if (!service) notFound();

  const path = servicePath(service.slug);
  const related = service.related
    .map((slug) => serviceBySlug(slug))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return (
    <>
      <JsonLd
        data={serviceJsonLd({
          path,
          name: service.title,
          description: service.metaDescription,
        })}
      />
      <JsonLd data={faqJsonLd(service.faqs)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Inicio", path: "/" },
          { name: "Servicios", path: "/servicios" },
          { name: service.navLabel, path },
        ])}
      />

      <Section tone="paper" className="pt-12 sm:pt-16">
        <nav aria-label="Migas" className="mb-8 text-sm text-[var(--m-muted)]">
          <Link href="/" className="hover:text-[var(--m-accent-ink)]">
            Inicio
          </Link>
          <span className="px-2">/</span>
          <Link href="/servicios" className="hover:text-[var(--m-accent-ink)]">
            Servicios
          </Link>
          <span className="px-2">/</span>
          <span className="text-[var(--m-ink-soft)]">{service.navLabel}</span>
        </nav>

        <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <h1 className="m-display">{service.title}</h1>
            {service.intro.map((paragraph) => (
              <p key={paragraph} className="m-lead mt-5">
                {paragraph}
              </p>
            ))}
            <div className="mt-8 flex flex-wrap gap-3">
              <PrimaryCta
                message={`Hola, quiero consultar por: ${service.title}.`}
              />
            </div>
          </div>

          <div className="m-card h-fit p-7 sm:p-8">
            <p className="m-eyebrow">Qué incluye</p>
            <TickList className="mt-4" items={service.includes} />
          </div>
        </div>
      </Section>

      <Section tone="surface">
        <SectionHeading
          eyebrow="Cómo trabajamos"
          title="El circuito, paso a paso"
        />
        <Steps steps={service.process} />
      </Section>

      <Section tone="wash">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHeading
            eyebrow="Qué recibís"
            title="Lo que queda en tus manos"
            lead="Documentación tuya, en formatos que podés abrir sin nosotros."
          />
          <TickList className="lg:pt-2" items={service.deliverables} />
        </div>
      </Section>

      <Section tone="paper">
        <Container className="px-0">
          <SectionHeading
            eyebrow="Preguntas frecuentes"
            title={`Sobre ${service.navLabel.toLowerCase()}`}
          />
          <Faqs faqs={service.faqs} />
        </Container>
      </Section>

      {related.length > 0 ? (
        <Section tone="surface">
          <SectionHeading title="Servicios relacionados" />
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {related.map((entry) => (
              <Link
                key={entry.slug}
                href={servicePath(entry.slug)}
                className="m-card m-card-link p-6"
              >
                <h3 className="m-h3">{entry.title}</h3>
                <p className="mt-2 text-sm text-[var(--m-ink-soft)]">
                  {entry.summary}
                </p>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      <ClosingCta message={`Hola, quiero consultar por: ${service.title}.`} />
    </>
  );
}
