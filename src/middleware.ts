import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "next-auth/middleware";
import { canOpen, normalizeRole } from "@/lib/roles";
import {
  isHostAwareCrawlerFile,
  isPublicAppPath,
  isMarketingPath,
  marketingRewrite,
  siteForHost,
  stripMarketingPrefix,
} from "@/lib/hosts";

/**
 * One process, two sites (PLAN Phase 9.1).
 *
 * `contador.com.py` is the accounting firm's public site and
 * `sistema.contador.com.py` is the application. The host decides which, and
 * the decision itself lives in `src/lib/hosts.ts` so it can be tested without
 * a request. Marketing hosts are *rewritten* into `/marketing/...`: route
 * groups do not change URLs, so a `(marketing)` group would collide with the
 * existing `(app)` group on `/`.
 *
 * On the application host everything is session-protected except /login, the
 * NextAuth routes, /api/cron (its own secret header) and `/e/...` (the
 * one-time invoice link, its own token).
 *
 * On top of the session gate, a role that may not open a path is bounced to
 * the dashboard rather than to /login — it is signed in, just not allowed
 * (PLAN Phase 6.3). This is the convenience half of role enforcement; the
 * binding half is the capability check inside every server action, since
 * those are POST endpoints any session can call directly.
 */
const authMiddleware = withAuth(
  function middleware(req) {
    const role = normalizeRole(req.nextauth.token?.role as string | undefined);
    if (canOpen(role, req.nextUrl.pathname)) return appResponse(NextResponse.next());

    if (req.nextUrl.pathname.startsWith("/api/")) {
      return appResponse(NextResponse.json({ error: "forbidden" }, { status: 403 }));
    }
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return appResponse(NextResponse.redirect(url));
  },
  { pages: { signIn: "/login" } }
);

/**
 * The application is never indexable, on any host it happens to answer on.
 * `robots.txt` says so too (Phase 9.2), but a header travels with the
 * response even when a crawler reached the URL some other way.
 */
function appResponse(res: NextResponse): NextResponse {
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export default function middleware(req: NextRequest, ...rest: unknown[]) {
  const { pathname } = req.nextUrl;

  // robots.txt / sitemap.xml answer for whichever host asked; the handlers
  // read the host themselves, so the middleware neither rewrites nor gates
  // them. Without this, the marketing sitemap would sit behind the login.
  if (isHostAwareCrawlerFile(pathname)) return NextResponse.next();

  if (siteForHost(req.headers.get("host")) === "marketing") {
    // `/marketing/servicios` asked for directly would be a second URL for
    // `/servicios`. Send crawlers and people to the canonical one.
    if (isMarketingPath(pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = stripMarketingPrefix(pathname);
      return NextResponse.redirect(url);
    }
    // Everything else is prefixed — including app paths, which then resolve
    // to a marketing 404 instead of falling through to an app route without
    // a session. Unrecognized hosts land here too: fail closed to marketing.
    const url = req.nextUrl.clone();
    url.pathname = marketingRewrite(pathname);
    return NextResponse.rewrite(url);
  }

  // App host: the marketing tree must not be reachable here, or the app host
  // would serve indexable copy under a second set of URLs.
  if (isMarketingPath(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return appResponse(NextResponse.redirect(url));
  }

  // The paths that authenticate themselves: /login, the NextAuth routes,
  // /api/cron (secret header) and /e/... (one-time invoice token). They stay
  // inside the matcher so the host branch above can fail them closed on a
  // marketing host; here, on the app host, they simply pass through.
  if (isPublicAppPath(pathname)) return appResponse(NextResponse.next());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = (authMiddleware as any)(req, ...rest);
  // withAuth builds its own responses (the redirect to /login among them);
  // stamp those too, so nothing the app host answers is indexable.
  if (res instanceof Promise) return res.then(stampIfResponse);
  return stampIfResponse(res);
}

function stampIfResponse(res: unknown): unknown {
  if (res instanceof NextResponse) return appResponse(res);
  return res;
}

export const config = {
  matcher: [
    // Everything except the framework's own static output. The paths that
    // authenticate themselves (/login, /api/auth, /api/cron, /e/...) used to
    // be excluded here; they are now excluded *inside* the middleware
    // instead, because the host branch has to see them — on the marketing
    // host they must 404 into the public site rather than serve the app's
    // login page on the apex.
    //
    // `robots.txt` and `sitemap.xml` stay out: both are host-aware route
    // handlers that answer unauthenticated on either host. The old matcher
    // excluded robots.txt only, which would have auth-walled the sitemap
    // (PLAN Phase 9.2 flags exactly this).
    "/((?!_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};
