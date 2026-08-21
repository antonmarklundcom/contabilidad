import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";
import { canOpen, normalizeRole } from "@/lib/roles";

/**
 * Everything is session-protected except /login, the NextAuth routes and
 * /api/cron (which authenticates with its own secret header).
 *
 * On top of the session gate, a role that may not open a path is bounced to
 * the dashboard rather than to /login — it is signed in, just not allowed
 * (PLAN Phase 6.3). This is the convenience half of role enforcement; the
 * binding half is the capability check inside every server action, since
 * those are POST endpoints any session can call directly.
 */
export default withAuth(
  function middleware(req) {
    const role = normalizeRole(req.nextauth.token?.role as string | undefined);
    if (canOpen(role, req.nextUrl.pathname)) return NextResponse.next();

    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  },
  { pages: { signIn: "/login" } }
);

export const config = {
  matcher: [
    "/((?!login|api/auth|api/cron|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
