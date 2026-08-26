import { headers } from "next/headers";
import { marketingOrigin, siteForHost } from "@/lib/hosts";

/**
 * Host-aware robots (PLAN Phase 9.2).
 *
 * `public/robots.txt` used to be a static `Disallow: /` served identically on
 * every host — correct for the application, fatal for the marketing site,
 * which exists to be indexed. One route, two answers, decided by the Host
 * header. The middleware deliberately does not touch this path.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const host = (await headers()).get("host");
  const marketing = siteForHost(host) === "marketing";

  const body = marketing
    ? ["User-agent: *", "Allow: /", "", `Sitemap: ${marketingOrigin()}/sitemap.xml`, ""].join("\n")
    : ["User-agent: *", "Disallow: /", ""].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      // The app is never indexable; say so in the header as well, since a
      // crawler that ignored robots.txt still sees this.
      ...(marketing ? {} : { "X-Robots-Tag": "noindex, nofollow" }),
    },
  });
}
