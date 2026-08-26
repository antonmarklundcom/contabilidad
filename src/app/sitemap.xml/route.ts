import { headers } from "next/headers";
import { MARKETING_PAGES } from "@/lib/marketing";
import { marketingOrigin, siteForHost } from "@/lib/hosts";

/**
 * The marketing sitemap (PLAN Phase 9.2). Like robots.txt it is excluded from
 * the middleware matcher — the old matcher excluded robots.txt but not this,
 * which would have put the sitemap behind the login.
 *
 * On the application host there is no sitemap at all: the app is noindex, and
 * an empty document would still be an invitation to crawl.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const host = (await headers()).get("host");
  if (siteForHost(host) !== "marketing") {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
    });
  }

  const origin = marketingOrigin();
  const urls = MARKETING_PAGES.map(
    (page) =>
      `  <url>\n    <loc>${origin}${page.path}</loc>\n` +
      `    <changefreq>monthly</changefreq>\n    <priority>${page.priority}</priority>\n  </url>`
  ).join("\n");

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
