import { withAuth } from "next-auth/middleware";

/**
 * Everything is session-protected except /login, the NextAuth routes and
 * /api/cron (which authenticates with its own secret header).
 */
export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    "/((?!login|api/auth|api/cron|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
