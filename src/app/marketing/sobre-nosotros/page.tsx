import type { Metadata } from "next";
import { accountingServiceJsonLd, canonicalUrl, FIRM } from "@/lib/marketing";
import { JsonLd } from "../json-ld";

/** TODO(copy): title, description and body come from the marketing copy task. */
const PAGE = {
  path: "/sobre-nosotros",
  name: "Sobre nosotros",
  description: "Quiénes somos.",
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: PAGE.name,
    description: PAGE.description,
    alternates: { canonical: canonicalUrl(PAGE.path) },
    openGraph: {
      type: "website",
      siteName: FIRM.name,
      title: PAGE.name,
      description: PAGE.description,
      url: canonicalUrl(PAGE.path),
      locale: "es_PY",
    },
  };
}

export default function Page() {
  return (
    <>
      <JsonLd data={accountingServiceJsonLd(PAGE)} />
      <h1 className="text-3xl font-semibold">Sobre nosotros</h1>
      {/* Placeholder. The copy is a separate task (PLAN Phase 9, "Not in scope"). */}
    </>
  );
}
