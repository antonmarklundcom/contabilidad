/**
 * Host routing (PLAN Phase 9.1) — which site a request belongs to.
 *
 * One Next.js process serves two sites: the accounting *firm's* public pages
 * on `contador.com.py` and the application on `sistema.contador.com.py`. The
 * split is made here, purely, so the deny paths are testable without a
 * request: `src/middleware.ts` is the only caller and does nothing but act on
 * these answers.
 *
 * The rule that matters is **fail closed to marketing**. An app host is only
 * an app host when it is on the allowlist; anything else — an unknown Host
 * header, a stray CNAME, a preview domain nobody registered — is served the
 * public marketing pages. The failure mode of guessing wrong in the other
 * direction is an unauthenticated app route, which is exactly what this
 * phase must never produce.
 */

/** Where the marketing pages live in the route tree (PLAN Phase 9.1). */
export const MARKETING_PREFIX = "/marketing";

/**
 * Not a route group. `(marketing)/page.tsx` and the existing `(app)/page.tsx`
 * would both resolve to `/` and fail the build — route groups do not change
 * the URL. The prefix is a real path segment, reached only by rewrite.
 */
const DEFAULT_APP_HOSTS = ["sistema.contador.com.py"];
const DEFAULT_MARKETING_HOSTS = ["contador.com.py", "www.contador.com.py"];

/** Local development and self-hosted checks address the app, not the site. */
const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"];

function fromEnv(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,\s]+/)
    .map((entry) => normalizeHost(entry))
    .filter((entry) => entry.length > 0);
}

/** Lowercase, strip the port and any trailing dot, tolerate an absent header. */
export function normalizeHost(host: string | null | undefined): string {
  if (!host) return "";
  let value = host.trim().toLowerCase();
  // IPv6 literals keep their brackets; only a trailing `:port` is dropped.
  const portMatch = value.match(/^(\[[^\]]*\]|[^:]*)(?::\d+)?$/);
  if (portMatch) value = portMatch[1];
  return value.replace(/\.$/, "");
}

/**
 * The environment as far as host routing cares: `APP_HOSTS` (extra hostnames
 * serving the application — staging, previews) and `MARKETING_HOSTS` (extra
 * hostnames serving the public site), both comma- or space-separated. Typed
 * loosely so a test can pass a literal.
 */
export type HostEnv = Record<string, string | undefined>;

export function appHosts(env: HostEnv = process.env): string[] {
  return [...DEFAULT_APP_HOSTS, ...LOCAL_HOSTNAMES, ...fromEnv(env.APP_HOSTS)];
}

export function marketingHosts(env: HostEnv = process.env): string[] {
  return [...DEFAULT_MARKETING_HOSTS, ...fromEnv(env.MARKETING_HOSTS)];
}

export type SiteKind = "app" | "marketing";

/**
 * The site a Host header addresses.
 *
 * The app allowlist is consulted first and is exact — no suffix matching, so
 * `sistema.contador.com.py.evil.example` is not the app. Everything that is
 * not explicitly an app host is marketing, including hosts nobody configured.
 */
export function siteForHost(host: string | null | undefined, env: HostEnv = process.env): SiteKind {
  const normalized = normalizeHost(host);
  if (normalized && appHosts(env).includes(normalized)) return "app";
  return "marketing";
}

/** Whether a path is (or claims to be) inside the marketing tree. */
export function isMarketingPath(pathname: string): boolean {
  return pathname === MARKETING_PREFIX || pathname.startsWith(`${MARKETING_PREFIX}/`);
}

/**
 * Strip the internal prefix back off, for the canonical redirect that keeps
 * `/marketing/servicios` from becoming a second URL for `/servicios`.
 */
export function stripMarketingPrefix(pathname: string): string {
  if (!isMarketingPath(pathname)) return pathname;
  const rest = pathname.slice(MARKETING_PREFIX.length);
  return rest === "" ? "/" : rest;
}

/**
 * The internal path a marketing-host request is rewritten to.
 *
 * Every path is prefixed, not just the four known pages: an app path asked
 * for on the apex becomes `/marketing/invoices`, which does not exist and
 * renders the marketing 404. That is the fail-closed half of item 1 — the
 * request never reaches an app route without a session.
 */
export function marketingRewrite(pathname: string): string {
  if (pathname === "/") return MARKETING_PREFIX;
  return `${MARKETING_PREFIX}${pathname}`;
}

/**
 * Files served identically-shaped but host-dependently: the middleware lets
 * them through untouched and the route handler reads the host itself.
 */
export function isHostAwareCrawlerFile(pathname: string): boolean {
  return pathname === "/robots.txt" || pathname === "/sitemap.xml";
}

/** Absolute origin of the public site, for sitemap and canonical URLs. */
export function marketingOrigin(env: HostEnv = process.env): string {
  const configured = (env.MARKETING_SITE_URL ?? "").trim().replace(/\/+$/, "");
  return configured || "https://contador.com.py";
}

/**
 * Paths on the application host that carry their own authentication and must
 * not be sent through the session gate: the login page itself, the NextAuth
 * routes, `/api/cron` (a secret header) and `/e/...` (the one-time invoice
 * link's single-use token, PLAN Phase 8.1).
 *
 * They used to be excluded from the middleware matcher. They are excluded
 * here instead so that the host branch still sees them — on a marketing host
 * `/login` must fail closed into the public site, not serve the app's login
 * page on the apex.
 */
const PUBLIC_APP_PATHS = [/^\/login(\/|$)/, /^\/api\/auth(\/|$)/, /^\/api\/cron(\/|$)/, /^\/e\//];

export function isPublicAppPath(pathname: string): boolean {
  return PUBLIC_APP_PATHS.some((pattern) => pattern.test(pathname));
}
