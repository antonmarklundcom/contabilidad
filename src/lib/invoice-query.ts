import type { Prisma } from "@prisma/client";

/** Shared list filter for the invoices page and its CSV export. */
export function buildInvoiceWhere(
  companyId: string,
  params: Record<string, string | undefined>
): Prisma.InvoiceWhereInput {
  const q = params.q?.trim();
  return {
    companyId,
    ...(params.status ? { status: params.status as never } : {}),
    ...(params.from || params.to
      ? {
          issueDate: {
            ...(params.from ? { gte: new Date(params.from) } : {}),
            ...(params.to ? { lte: new Date(`${params.to}T23:59:59`) } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { fullNumber: { contains: q } },
            { cdc: { contains: q } },
            { client: { razonSocial: { contains: q, mode: "insensitive" as const } } },
            { client: { ruc: { contains: q } } },
          ],
        }
      : {}),
  };
}
