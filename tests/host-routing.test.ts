import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  MARKETING_PREFIX,
  appHosts,
  isHostAwareCrawlerFile,
  isMarketingPath,
  isPublicAppPath,
  marketingOrigin,
  marketingRewrite,
  normalizeHost,
  siteForHost,
  stripMarketingPrefix,
} from "@/lib/hosts";
import { canonicalUrl } from "@/lib/marketing";

/**
 * PLAN Phase 9.1/9.2 — the marketing/app host split.
 *
 * The rule under test is the fail-closed one: only an allowlisted host is the
 * application, and everything else is served the public site. Getting that
 * backwards means an unauthenticated app route on a domain we do not control,
 * so these are deny-path tests, like `roles.test.ts`.
 */

const APP = "sistema.contador.com.py";
const EMPTY = {} as Record<string, string | undefined>;

describe("normalizeHost", () => {
  it("lowercases, drops the port and a trailing dot", () => {
    expect(normalizeHost("Sistema.Contador.COM.PY:3000")).toBe(APP);
    expect(normalizeHost("contador.com.py.")).toBe("contador.com.py");
    expect(normalizeHost("  localhost:8080 ")).toBe("localhost");
  });

  it("tolerates a missing Host header", () => {
    expect(normalizeHost(null)).toBe("");
    expect(normalizeHost(undefined)).toBe("");
    expect(normalizeHost("")).toBe("");
  });

  it("keeps an IPv6 literal intact", () => {
    expect(normalizeHost("[::1]:3000")).toBe("[::1]");
  });
});

describe("siteForHost", () => {
  it("serves the app on the app host and localhost", () => {
    expect(siteForHost(APP, EMPTY)).toBe("app");
    expect(siteForHost(`${APP}:3000`, EMPTY)).toBe("app");
    expect(siteForHost("localhost:3000", EMPTY)).toBe("app");
    expect(siteForHost("127.0.0.1", EMPTY)).toBe("app");
  });

  it("serves marketing on the apex and www", () => {
    expect(siteForHost("contador.com.py", EMPTY)).toBe("marketing");
    expect(siteForHost("www.contador.com.py", EMPTY)).toBe("marketing");
  });

  it("fails closed to marketing for an unknown or missing host", () => {
    for (const host of [null, undefined, "", "example.com", "staging.internal", "1.2.3.4"]) {
      expect(siteForHost(host, EMPTY)).toBe("marketing");
    }
  });

  it("never suffix-matches its way into the app", () => {
    // The lookalike a client can put in a Host header.
    expect(siteForHost("sistema.contador.com.py.evil.example", EMPTY)).toBe("marketing");
    expect(siteForHost("evil-sistema.contador.com.py", EMPTY)).toBe("marketing");
    expect(siteForHost("x.sistema.contador.com.py", EMPTY)).toBe("marketing");
  });

  it("takes extra app hosts from the environment, normalized", () => {
    const env = { APP_HOSTS: "Staging.Contador.com.py, preview.example:443" };
    expect(siteForHost("staging.contador.com.py", env)).toBe("app");
    expect(siteForHost("preview.example", env)).toBe("app");
    expect(siteForHost("other.example", env)).toBe("marketing");
  });

  it("ignores blank entries rather than matching the empty host", () => {
    const env = { APP_HOSTS: " , ,, " };
    expect(appHosts(env)).not.toContain("");
    expect(siteForHost("", env)).toBe("marketing");
  });
});

describe("marketing rewrites", () => {
  it("maps the public paths onto the internal prefix", () => {
    expect(marketingRewrite("/")).toBe(MARKETING_PREFIX);
    expect(marketingRewrite("/servicios")).toBe(`${MARKETING_PREFIX}/servicios`);
    expect(marketingRewrite("/contacto")).toBe(`${MARKETING_PREFIX}/contacto`);
  });

  it("prefixes app paths too, so they 404 into the site instead of leaking", () => {
    for (const appPath of ["/invoices", "/settings", "/api/settings", "/login", "/e/abc"]) {
      expect(marketingRewrite(appPath)).toBe(`${MARKETING_PREFIX}${appPath}`);
      expect(marketingRewrite(appPath).startsWith(`${MARKETING_PREFIX}/`)).toBe(true);
    }
  });

  it("round-trips the prefix for the canonical redirect", () => {
    expect(isMarketingPath(MARKETING_PREFIX)).toBe(true);
    expect(isMarketingPath(`${MARKETING_PREFIX}/servicios`)).toBe(true);
    expect(isMarketingPath("/marketingueros")).toBe(false);
    expect(stripMarketingPrefix(MARKETING_PREFIX)).toBe("/");
    expect(stripMarketingPrefix(`${MARKETING_PREFIX}/servicios`)).toBe("/servicios");
    expect(stripMarketingPrefix("/invoices")).toBe("/invoices");
  });
});

describe("self-authenticating app paths", () => {
  it("names exactly the paths that carry their own credential", () => {
    for (const p of ["/login", "/api/auth/session", "/api/cron", "/e/token", "/e/token/kude"]) {
      expect(isPublicAppPath(p)).toBe(true);
    }
  });

  it("does not exempt the app's data routes", () => {
    for (const p of ["/", "/invoices", "/api/settings", "/api/export/libro", "/logins"]) {
      expect(isPublicAppPath(p)).toBe(false);
    }
  });
});

describe("crawler files", () => {
  it("recognizes robots.txt and sitemap.xml, and nothing else", () => {
    expect(isHostAwareCrawlerFile("/robots.txt")).toBe(true);
    expect(isHostAwareCrawlerFile("/sitemap.xml")).toBe(true);
    expect(isHostAwareCrawlerFile("/sitemap-index.xml")).toBe(false);
    expect(isHostAwareCrawlerFile("/invoices")).toBe(false);
  });

  it("has no static robots.txt left to shadow the host-aware route", () => {
    // The old `public/robots.txt` was `Disallow: /` on every host, which
    // would have blocked the marketing site it now has to allow.
    expect(existsSync(path.join(process.cwd(), "public/robots.txt"))).toBe(false);
    expect(existsSync(path.join(process.cwd(), "src/app/robots.txt/route.ts"))).toBe(true);
    expect(existsSync(path.join(process.cwd(), "src/app/sitemap.xml/route.ts"))).toBe(true);
  });
});

describe("middleware matcher", () => {
  const source = readFileSync(path.join(process.cwd(), "src/middleware.ts"), "utf8");
  // JSON.parse so the TypeScript string escapes (`robots\\.txt`) become the
  // regex the framework actually compiles.
  const literal = source.match(/"\/\(\(\?!.*?"/)?.[0];
  const matcher = literal ? (JSON.parse(literal) as string) : "";
  const pattern = new RegExp(`^${matcher}$`);

  it("was found", () => {
    expect(matcher).toBeTruthy();
  });

  it("excludes both crawler files, not just robots.txt (PLAN Phase 9.2)", () => {
    // The original matcher excluded robots.txt only; a marketing sitemap
    // would then have been auth-walled.
    expect(pattern.test("/robots.txt")).toBe(false);
    expect(pattern.test("/sitemap.xml")).toBe(false);
  });

  it("still runs on the self-authenticating paths, so the host branch sees them", () => {
    // They are exempted inside the middleware now. If the matcher skipped
    // them, `/login` would serve the app's login page on the marketing apex.
    for (const p of ["/login", "/api/auth/session", "/api/cron", "/e/abc"]) {
      expect(pattern.test(p)).toBe(true);
    }
  });

  it("runs on the app routes and on the marketing tree", () => {
    for (const p of ["/", "/invoices", "/settings", MARKETING_PREFIX, `${MARKETING_PREFIX}/servicios`]) {
      expect(pattern.test(p)).toBe(true);
    }
  });

  it("skips the framework's static output", () => {
    for (const p of ["/_next/static/chunk.js", "/_next/image", "/favicon.ico"]) {
      expect(pattern.test(p)).toBe(false);
    }
  });
});

describe("marketing pages", () => {
  // Route files behind the sitemap — including the dynamic service and guide
  // segments — are covered in `marketing-site.test.ts`, next to the content
  // they render.

  it("builds absolute canonical URLs without a double slash", () => {
    expect(canonicalUrl("/")).toBe(marketingOrigin());
    expect(canonicalUrl("/servicios")).toBe(`${marketingOrigin()}/servicios`);
  });

  it("defaults the origin to the apex and honours the override", () => {
    expect(marketingOrigin(EMPTY)).toBe("https://contador.com.py");
    expect(marketingOrigin({ MARKETING_SITE_URL: "https://example.com/" })).toBe(
      "https://example.com"
    );
  });
});
