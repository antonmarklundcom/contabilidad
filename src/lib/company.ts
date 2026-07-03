import { prisma } from "@/lib/prisma";

/**
 * Single-tenant today: one Company row. Everything still filters by
 * companyId so multi-tenancy later is a matter of scoping this lookup
 * to the session.
 */
export async function getCompanyId(): Promise<string> {
  const company = await prisma.company.findFirst({ select: { id: true } });
  if (!company) throw new Error("No company configured — run the seed or complete Settings");
  return company.id;
}
