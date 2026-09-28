/**
 * Which company the current request is about (PLAN Phase 6.4).
 *
 * Multi-tenant now: the session's `companyId` decides, so two companies can
 * live in one database and every existing query — all of which already filter
 * by `companyId` — is scoped correctly without being touched.
 *
 * Contexts with no session (the job runner, `/api/cron`, scripts) still need
 * an answer. They get the sole company when there is exactly one, which keeps
 * a single-tenant install working; with more than one they must pass the
 * company explicitly rather than have a tenant picked for them, so the
 * lookup refuses instead of guessing.
 *
 * Multi-company users (PLAN Phase 0.4): an accountant may belong to several
 * companies via `Membership`. The ACTIVE one is the `active_company` cookie
 * (set only by `switchCompany`), and it is honoured only while a membership
 * row backs it — re-checked on every request, so revoking a membership takes
 * effect immediately and a hand-edited cookie gets nothing. Otherwise the
 * user's default company (`User.companyId`, carried in the session) applies.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type CompanyResolution =
  | { ok: true; companyId: string }
  | { ok: false; reason: "no_company_for_user" | "no_company" | "ambiguous" };

/**
 * The decision, without I/O, so both branches are testable.
 *
 * A session always wins — including when it carries no company, which is a
 * user who has not been attached to one and must not silently fall through to
 * "the first company in the database".
 */
export function resolveCompanyId(input: {
  hasSession: boolean;
  sessionCompanyId: string | null | undefined;
  companyIds: readonly string[];
  /** Company the user switched to (cookie), if any. */
  requestedCompanyId?: string | null;
  /** Whether a Membership row backs `requestedCompanyId`. */
  requestedIsMember?: boolean;
}): CompanyResolution {
  if (input.hasSession) {
    if (input.requestedCompanyId && input.requestedIsMember) {
      return { ok: true, companyId: input.requestedCompanyId };
    }
    return input.sessionCompanyId
      ? { ok: true, companyId: input.sessionCompanyId }
      : { ok: false, reason: "no_company_for_user" };
  }
  if (input.companyIds.length === 1) return { ok: true, companyId: input.companyIds[0] };
  if (input.companyIds.length === 0) return { ok: false, reason: "no_company" };
  return { ok: false, reason: "ambiguous" };
}

const MESSAGES: Record<Exclude<CompanyResolution, { ok: true }>["reason"], string> = {
  no_company_for_user:
    "Your user is not linked to a company — ask an administrator to assign one",
  no_company: "No company configured — run the seed or complete Settings",
  ambiguous:
    "More than one company exists and there is no session — pass companyId explicitly in background jobs",
};

export const ACTIVE_COMPANY_COOKIE = "active_company";

async function readActiveCompanyCookie(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).get(ACTIVE_COMPANY_COOKIE)?.value ?? null;
  } catch {
    return null; // no request scope (job runner, scripts)
  }
}

export async function isMember(userId: string, companyId: string): Promise<boolean> {
  const row = await prisma.membership.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: { id: true },
  });
  return Boolean(row);
}

/** Companies the user may switch to, default first. */
export async function memberCompanies(
  userId: string
): Promise<{ id: string; razonSocial: string; ruc: string; dv: string }[]> {
  const rows = await prisma.membership.findMany({
    where: { userId },
    select: { company: { select: { id: true, razonSocial: true, ruc: true, dv: true } } },
    orderBy: { company: { razonSocial: "asc" } },
  });
  return rows.map((r) => r.company);
}

export async function getCompanyId(): Promise<string> {
  const session = await getServerSession(authOptions);
  const hasSession = Boolean(session?.user);

  let requestedCompanyId: string | null = null;
  let requestedIsMember = false;
  if (hasSession) {
    requestedCompanyId = await readActiveCompanyCookie();
    if (requestedCompanyId && requestedCompanyId !== session?.user?.companyId) {
      requestedIsMember = await isMember(session!.user.id, requestedCompanyId);
    } else if (requestedCompanyId) {
      requestedIsMember = true; // the default company needs no second lookup
    }
  }

  // Only read the company table when there is no session to ask.
  const companyIds = hasSession
    ? []
    : (await prisma.company.findMany({ select: { id: true }, take: 2 })).map((c) => c.id);

  const resolved = resolveCompanyId({
    hasSession,
    sessionCompanyId: session?.user?.companyId,
    companyIds,
    requestedCompanyId,
    requestedIsMember,
  });
  if (resolved.ok) return resolved.companyId;
  throw new Error(MESSAGES[resolved.reason]);
}
