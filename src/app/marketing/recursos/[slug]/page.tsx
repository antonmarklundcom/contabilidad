import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  FIRM,
  GUIDES,
  breadcrumbJsonLd,
  canonicalUrl,
  guideBySlug,
  guidePath,
  pageMetadata,
  serviceBySlug,
  servicePath,
} from "@/lib/marketing";
import { marketingOrigin } from "@/lib/hosts";
import { JsonLd } from "../../json-ld";
import { ClosingCta, Container, Section } from "../../_components/ui";

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const guide = guideBySlug((await params).slug);
  if (!guide) return {};
  return {
    ...pageMetadata({
      path: guidePath(guide.slug),
      title: guide.metaTitle,
      description: guide.metaDescription,
    }),
    openGraph: {
      type: "article",
      siteName: FIRM.name,
      title: guide.metaTitle,
      description: guide.metaDescription,
      url: canonicalUrl(guidePath(guide.slug)),
      publishedTime: guide.published,
      locale: "es_PY",
    },
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const guide = guideBySlug((await params).slug);
  if (!guide) notFound();

  const path = guidePath(guide.slug);
  const related = guide.related
    .map((slug) => serviceBySlug(slug))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: guide.title,
          description: guide.metaDescription,
          datePublished: guide.published,
          dateModified: guide.published,
          inLanguage: "es-PY",
          mainEntityOfPage: canonicalUrl(path),
          author: { "@id": `${marketingOrigin()}/#organization` },
          publisher: { "@id": `${marketingOrigin()}/#organization` },
        }}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Inicio", path: "/" },
          { name: "Recursos", path: "/recursos" },
          { name: guide.title, path },
        ])}
      />

      <Section tone="paper" className="pt-12 sm:pt-16">
        <Container className="max-w-3xl px-0">
          <nav
            aria-label="Migas"
            className="mb-8 text-sm text-[var(--m-muted)]"
          >
            <Link href="/" className="hover:text-[var(--m-accent-ink)]">
              Inicio
            </Link>
            <span className="px-2">/</span>
            <Link href="/recursos" className="hover:text-[var(--m-accent-ink)]">
              Recursos
            </Link>
          </nav>

          <article>
            <h1 className="m-display">{guide.title}</h1>
            <p className="m-lead mt-5">{guide.summary}</p>
            <p className="mt-4 text-sm text-[var(--m-muted)]">
              <time dateTime={guide.published}>
                {new Date(guide.published).toLocaleDateString("es-PY", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>{" "}
              · {guide.readingMinutes} min de lectura
            </p>

            <div className="m-rule mt-10 space-y-10 pt-10">
              {guide.sections.map((section) => (
                <section key={section.heading}>
                  <h2 className="m-h3">{section.heading}</h2>
                  {section.body.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="mt-3 text-[var(--m-ink-soft)] leading-relaxed"
                    >
                      {paragraph}
                    </p>
                  ))}
                </section>
              ))}
            </div>
          </article>
        </Container>
      </Section>

      {related.length > 0 ? (
        <Section tone="surface">
          <h2 className="m-h3">Si esto te toca de cerca</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {related.map((service) => (
              <Link
                key={service.slug}
                href={servicePath(service.slug)}
                className="m-card m-card-link p-6"
              >
                <h3 className="m-h3">{service.title}</h3>
                <p className="mt-2 text-sm text-[var(--m-ink-soft)]">
                  {service.summary}
                </p>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      <ClosingCta
        message={`Hola, leí "${guide.title}" y tengo una consulta.`}
      />
    </>
  );
}
