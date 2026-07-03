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
    await prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        detail: detail as Prisma.InputJsonValue | undefined,
        userId: session?.user?.id ?? null,
        companyId: session?.user?.companyId ?? null,
      },
    });
  } catch (err) {
    console.error("audit log failed", err);
  }
}
