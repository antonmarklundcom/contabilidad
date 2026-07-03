import { prisma } from "@/lib/prisma";
import type { SifenMode } from "./types";

/** Persists every raw SIFEN request/response for audit & debugging. */
export async function logSifen(entry: {
  operation: string;
  mode: SifenMode;
  companyId?: string | null;
  invoiceId?: string | null;
  requestXml?: string | null;
  responseXml?: string | null;
  success?: boolean;
  detail?: string;
}): Promise<void> {
  try {
    await prisma.sifenLog.create({
      data: {
        operation: entry.operation,
        mode: entry.mode,
        companyId: entry.companyId ?? null,
        invoiceId: entry.invoiceId ?? null,
        requestXml: entry.requestXml ?? null,
        responseXml: entry.responseXml ?? null,
        success: entry.success,
        detail: entry.detail,
      },
    });
  } catch (err) {
    // Logging must never break the main flow.
    console.error("sifen_log write failed", err);
  }
}
