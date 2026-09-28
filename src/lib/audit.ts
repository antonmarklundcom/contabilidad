import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

/** Best-effort audit trail — never blocks the main flow. */
export async function audit(
  action: string,
  entity: string,
  entityId?: string,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    const session = await getServerSession(authOptions);
    // The ACTIVE company (Phase 0.4), not the default one the session carries.
    const { getCompanyId } = await import("@/lib/company");
    const companyId = session?.user
      ? await getCompanyId().catch(() => session.user.companyId ?? null)
      : null;
    await prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        detail: detail as Prisma.InputJsonValue | undefined,
        userId: session?.user?.id ?? null,
        companyId,
      },
    });
  } catch (err) {
    console.error("audit log failed", err);
  }
}
