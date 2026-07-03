import { prisma } from "@/lib/prisma";

/**
 * Returns the next strictly-sequential 7-digit document number for
 * (expedition point, document type). The increment is a single atomic
 * UPDATE (works on PostgreSQL and MySQL), so concurrent emissions can
 * never receive the same number.
 */
export async function nextDocumentNumber(
  expeditionPointId: string,
  tipoDocumento: number
): Promise<string> {
  const seq = await prisma.documentSequence.update({
    where: {
      expeditionPointId_tipoDocumento: { expeditionPointId, tipoDocumento },
    },
    data: { currentNumber: { increment: 1 } },
  });
  if (seq.currentNumber > 9_999_999) {
    throw new Error(
      `Document sequence exhausted (7 digits) for point ${expeditionPointId} type ${tipoDocumento}`
    );
  }
  return String(seq.currentNumber).padStart(7, "0");
}

/** Creates the sequence row if missing (used when adding new points/types). */
export async function ensureSequence(
  companyId: string,
  expeditionPointId: string,
  tipoDocumento: number
): Promise<void> {
  await prisma.documentSequence.upsert({
    where: {
      expeditionPointId_tipoDocumento: { expeditionPointId, tipoDocumento },
    },
    update: {},
    create: { companyId, expeditionPointId, tipoDocumento, currentNumber: 0 },
  });
}
