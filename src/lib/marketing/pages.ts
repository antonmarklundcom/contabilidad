/**
 * Every public URL of the marketing site, in one list.
 *
 * The sitemap, the navigation and the tests all read this, so a page that
 * exists but is unreachable (or listed but missing) is a test failure rather
 * than something a crawler discovers first.
 */

import { GUIDES, guidePath } from "./guides";
import { SERVICES, servicePath } from "./services";

export type MarketingPage = {
  /** Public path on the marketing host, not the internal `/marketing/...` one. */
  path: string;
  /** Sitemap weight; the home page leads. */
  priority: string;
  /** Whether it belongs in the header navigation. */
  nav?: { label: string; order: number };
};

const STATIC_PAGES: MarketingPage[] = [
  { path: "/", priority: "1.0" },
  {
    path: "/servicios",
    priority: "0.9",
    nav: { label: "Servicios", order: 1 },
  },
  {
    path: "/portal-clientes",
    priority: "0.8",
    nav: { label: "Portal de clientes", order: 2 },
  },
  {
    path: "/honorarios",
    priority: "0.7",
    nav: { label: "Honorarios", order: 3 },
  },
  {
    path: "/sobre-nosotros",
    priority: "0.6",
    nav: { label: "Sobre nosotros", order: 4 },
  },
  { path: "/contacto", priority: "0.8", nav: { label: "Contacto", order: 5 } },
  { path: "/recursos", priority: "0.5" },
  { path: "/privacidad", priority: "0.2" },
];

export const MARKETING_PAGES: readonly MarketingPage[] = [
  ...STATIC_PAGES,
  ...SERVICES.map((service) => ({
    path: servicePath(service.slug),
    priority: "0.8",
  })),
  ...GUIDES.map((guide) => ({ path: guidePath(guide.slug), priority: "0.5" })),
];

export const NAV_PAGES = STATIC_PAGES.filter((page) => page.nav).sort(
  (a, b) => a.nav!.order - b.nav!.order,
);
