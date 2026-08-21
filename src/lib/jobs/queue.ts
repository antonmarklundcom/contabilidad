import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type JobType =
  | "send_dte"
  | "query_status"
  | "generate_kude"
  | "cancel_dte"
  | "backup"
  | "filing_reminder";

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  opts?: { delaySeconds?: number; maxAttempts?: number }
): Promise<string> {
  const job = await prisma.jobQueue.create({
    data: {
      type,
      payload: payload as Prisma.InputJsonValue,
      maxAttempts: opts?.maxAttempts ?? 8,
      nextRunAt: new Date(Date.now() + (opts?.delaySeconds ?? 0) * 1000),
    },
  });
  return job.id;
}

/** Exponential backoff: 30s, 1m, 2m, 4m, 8m… capped at 30m. */
export function backoffSeconds(attempts: number): number {
  return Math.min(30 * 2 ** attempts, 1800);
}
