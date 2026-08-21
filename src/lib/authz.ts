/**
 * Server-side capability checks (PLAN Phase 6.3).
 *
 * The rule table lives in `roles.ts` (pure); this is the thin session-reading
 * edge every server action and API route calls. Actions must call it even
 * though the middleware also gates the page: a server action is a POST
 * endpoint that any authenticated session can invoke directly, so the route
 * check is a convenience for the user, not the security boundary.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { can, normalizeRole, type Capability, type Role } from "@/lib/roles";

/** The session's role, defaulting to the most restricted one. */
export async function currentRole(): Promise<Role> {
  const session = await getServerSession(authOptions);
  return normalizeRole(session?.user?.role);
}

/**
 * Throws nothing: callers return `{ ok: false, error: "forbidden" }` so the UI
 * can say so instead of showing a stack trace.
 *
 * A refusal is audited — an attempt to do something a role may not do is
 * exactly the kind of thing the audit trail exists for.
 */
export async function allowed(capability: Capability): Promise<boolean> {
  const role = await currentRole();
  if (can(role, capability)) return true;
  await audit("denied", "capability", capability, { role });
  return false;
}

/** `{ ok: false, error: "forbidden" }` — the shape every action already uses. */
export const FORBIDDEN = { ok: false as const, error: "forbidden" as const };
