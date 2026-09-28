"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { allowed } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { ACTIVE_COMPANY_COOKIE, isMember } from "@/lib/company";

/**
 * Switches the company the user is working in (PLAN Phase 0.4).
 *
 * Only a company the user holds a Membership in (or their default company) is
 * accepted. The cookie is a preference, not a credential: `getCompanyId()`
 * re-checks the membership on every request, so this check is for a clear
 * error, and the boundary stays where it was.
 */
export async function switchCompany(
  companyId: string
): Promise<{ ok: true } | { ok: false; error: "forbidden" | "not_member" }> {
  if (!(await allowed("read"))) return { ok: false, error: "forbidden" };
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, error: "forbidden" };

  const isDefault = companyId === session.user.companyId;
  if (!isDefault && !(await isMember(session.user.id, companyId))) {
    await audit("denied", "company_switch", companyId);
    return { ok: false, error: "not_member" };
  }

  const jar = await cookies();
  if (isDefault) jar.delete(ACTIVE_COMPANY_COOKIE);
  else
    jar.set(ACTIVE_COMPANY_COOKIE, companyId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12, // matches the session lifetime
    });

  await audit("switch", "company", companyId);
  revalidatePath("/", "layout");
  return { ok: true };
}
