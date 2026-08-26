import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  FIRM,
  GUIDES,
  MARKETING_PAGES,
  NAV_PAGES,
  SERVICES,
  canonicalUrl,
  contactable,
  guideBySlug,
  guidePath,
  organizationJsonLd,
  serviceBySlug,
  servicePath,
  whatsappUrl,
} from "@/lib/marketing";
import {
  formatLeadEmail,
  hasReplyChannel,
  leadSchema,
  rateLimitLead,
  resetLeadRateLimit,
} from "@/lib/marketing/lead";

/**
 * PLAN Phase 9.3/9.4 — the public site.
 *
 * Two things are worth a test here and the rest is copy. First, the SEO
 * surface: a page in the sitemap that does not exist, a duplicated slug or a
 * title that Google truncates are all invisible until a crawler finds them.
 * Second, and more important, the anti-fabrication rule: the site must not be
 * able to state a fact about the firm that `firm.ts` does not hold.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe("service catalogue", () => {
  it("has a unique, url-safe slug per service", () => {
    const slugs = SERVICES.map((service) => service.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(SLUG);
  });

  it("keeps titles and descriptions inside what search engines render", () => {
    for (const service of SERVICES) {
      expect(service.metaTitle.length, `metaTitle too long: ${service.slug}`).toBeLessThanOrEqual(60);
      expect(
        service.metaDescription.length,
        `metaDescription too long: ${service.slug}`
      ).toBeLessThanOrEqual(155);
      expect(service.metaDescription.length).toBeGreaterThan(70);
    }
  });

  it("gives every service enough substance to be a page", () => {
    for (const service of SERVICES) {
      expect(service.intro.length).toBeGreaterThanOrEqual(1);
      expect(service.includes.length).toBeGreaterThanOrEqual(3);
      expect(service.process.length).toBeGreaterThanOrEqual(3);
      expect(service.deliverables.length).toBeGreaterThanOrEqual(2);
      expect(service.faqs.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("cross-links only to services that exist, never to itself", () => {
    for (const service of SERVICES) {
      for (const slug of service.related) {
        expect(serviceBySlug(slug), `${service.slug} links to unknown ${slug}`).toBeDefined();
        expect(slug).not.toBe(service.slug);
      }
    }
  });
});

describe("guides", () => {
  it("has unique slugs and real bodies", () => {
    const slugs = GUIDES.map((guide) => guide.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const guide of GUIDES) {
      expect(guide.slug).toMatch(SLUG);
      expect(guide.sections.length).toBeGreaterThanOrEqual(3);
      for (const section of guide.sections) expect(section.body.length).toBeGreaterThanOrEqual(1);
      expect(guide.metaTitle.length).toBeLessThanOrEqual(60);
      expect(guide.metaDescription.length).toBeLessThanOrEqual(155);
    }
  });

  it("carries a real publication date, never a future one", () => {
    for (const guide of GUIDES) {
      expect(guide.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(guide.published))).toBe(false);
      expect(Date.parse(guide.published)).toBeLessThanOrEqual(Date.now());
    }
  });

  it("points at services that exist", () => {
    for (const guide of GUIDES) {
      for (const slug of guide.related) expect(serviceBySlug(slug)).toBeDefined();
    }
  });
});

describe("sitemap and routes", () => {
  it("lists every service and every guide exactly once", () => {
    const paths = MARKETING_PAGES.map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const service of SERVICES) expect(paths).toContain(servicePath(service.slug));
    for (const guide of GUIDES) expect(paths).toContain(guidePath(guide.slug));
    expect(paths).toContain("/");
  });

  it("has a real page file behind every static path in the sitemap", () => {
    const dynamic = new Set([
      ...SERVICES.map((service) => servicePath(service.slug)),
      ...GUIDES.map((guide) => guidePath(guide.slug)),
    ]);
    for (const page of MARKETING_PAGES) {
      if (dynamic.has(page.path)) continue;
      const dir = page.path === "/" ? "" : page.path;
      expect(
        existsSync(path.join(process.cwd(), `src/app/marketing${dir}/page.tsx`)),
        `no page for ${page.path}`
      ).toBe(true);
    }
    // And the two dynamic segments that render the rest.
    expect(existsSync(path.join(process.cwd(), "src/app/marketing/servicios/[slug]/page.tsx"))).toBe(
      true
    );
    expect(existsSync(path.join(process.cwd(), "src/app/marketing/recursos/[slug]/page.tsx"))).toBe(
      true
    );
  });

  it("navigates to pages that are in the sitemap", () => {
    const paths = new Set(MARKETING_PAGES.map((page) => page.path));
    for (const page of NAV_PAGES) expect(paths.has(page.path)).toBe(true);
  });

  it("builds canonical URLs without a trailing or doubled slash", () => {
    for (const page of MARKETING_PAGES) {
      const url = canonicalUrl(page.path);
      expect(url.startsWith("https://")).toBe(true);
      expect(url.slice(8)).not.toContain("//");
      if (page.path !== "/") expect(url.endsWith("/")).toBe(false);
    }
  });

  it("resolves a slug back to its content", () => {
    expect(serviceBySlug(SERVICES[0].slug)?.title).toBe(SERVICES[0].title);
    expect(guideBySlug(GUIDES[0].slug)?.title).toBe(GUIDES[0].title);
    expect(serviceBySlug("no-existe")).toBeUndefined();
    expect(guideBySlug("no-existe")).toBeUndefined();
  });
});

describe("anti-fabrication: the firm's own facts", () => {
  /**
   * The house rule, made mechanical: a contact detail the owner has not
   * supplied must not appear anywhere. These assertions are written against
   * whatever `firm.ts` currently holds, so they keep protecting the site
   * after the real values land.
   */
  it("never invents a WhatsApp link", () => {
    if (FIRM.whatsapp === null) expect(whatsappUrl()).toBeNull();
    else expect(whatsappUrl()).toContain(FIRM.whatsapp.replace(/\D/g, ""));
  });

  it("reports contactability from the facts, not from hope", () => {
    expect(contactable()).toBe(Boolean(FIRM.whatsapp || FIRM.phoneDisplay || FIRM.email));
  });

  it("omits missing facts from the structured data instead of emptying them", () => {
    const jsonLd = organizationJsonLd() as Record<string, unknown>;
    for (const [key, fact] of [
      ["telephone", FIRM.phoneDisplay],
      ["email", FIRM.email],
      ["address", FIRM.address],
      ["legalName", FIRM.razonSocial],
    ] as const) {
      if (fact === null) expect(key in jsonLd).toBe(false);
      else expect(jsonLd[key]).toBeTruthy();
    }
  });

  it("claims LocalBusiness only once there is a place of business", () => {
    // An AccountingService (a LocalBusiness subtype) with no address is the
    // thin claim search engines discount — and one we cannot support.
    expect(jsonLdType()).toBe(FIRM.address ? "AccountingService" : "Organization");
    function jsonLdType() {
      return (organizationJsonLd() as { "@type": string })["@type"];
    }
  });

  it("never emits a rating, a review or a client count", () => {
    const serialized = JSON.stringify(organizationJsonLd());
    for (const forbidden of ["aggregateRating", "review", "ratingValue", "numberOfEmployees"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("contact form", () => {
  const valid = {
    name: "Ana Giménez",
    email: "ana@example.com",
    phone: "",
    company: "",
    subject: "",
    message: "Quiero consultar por la contabilidad mensual de mi empresa.",
    website: "",
  };

  it("accepts a well-formed message", () => {
    expect(leadSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty or too-short message", () => {
    expect(leadSchema.safeParse({ ...valid, message: "hola" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...valid, name: "A" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...valid, email: "no-es-un-correo" }).success).toBe(false);
  });

  it("treats a filled honeypot as invalid input", () => {
    expect(leadSchema.safeParse({ ...valid, website: "http://spam.example" }).success).toBe(false);
  });

  it("requires some way to answer", () => {
    expect(hasReplyChannel({ ...valid })).toBe(true);
    expect(hasReplyChannel({ ...valid, email: "", phone: "+595 981 000000" })).toBe(true);
    expect(hasReplyChannel({ ...valid, email: "", phone: "" })).toBe(false);
  });

  it("throttles a single caller and forgets after the window", () => {
    resetLeadRateLimit();
    const start = 1_000_000;
    for (let i = 0; i < 5; i += 1) expect(rateLimitLead("1.2.3.4", start)).toBe(true);
    expect(rateLimitLead("1.2.3.4", start)).toBe(false);
    // A different caller is unaffected...
    expect(rateLimitLead("5.6.7.8", start)).toBe(true);
    // ...and an hour later the first one is allowed again.
    expect(rateLimitLead("1.2.3.4", start + 60 * 60 * 1000 + 1)).toBe(true);
  });

  it("puts the message in the email without losing the reply address", () => {
    const body = formatLeadEmail({ ...valid, company: "Cliente SA" });
    expect(body).toContain("ana@example.com");
    expect(body).toContain("Cliente SA");
    expect(body).toContain(valid.message);
  });
});
