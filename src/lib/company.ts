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
}): CompanyResolution {
  if (input.hasSession) {
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

export async function getCompanyId(): Promise<string> {
  const session = await getServerSession(authOptions);
  const hasSession = Boolean(session?.user);

  // Only read the company table when there is no session to ask.
  const companyIds = hasSession
    ? []
    : (await prisma.company.findMany({ select: { id: true }, take: 2 })).map((c) => c.id);

  const resolved = resolveCompanyId({
    hasSession,
    sessionCompanyId: session?.user?.companyId,
    companyIds,
  });
  if (resolved.ok) return resolved.companyId;
  throw new Error(MESSAGES[resolved.reason]);
}
