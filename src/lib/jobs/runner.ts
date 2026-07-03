/**
 * DB-backed job runner (no Redis — Hostinger constraint).
 * Triggered by (a) an in-process interval started on boot and
 * (b) GET/POST /api/cron with the x-cron-secret header (external cron).
 * Jobs are claimed with an atomic updateMany so concurrent runners
 * (interval + cron) never execute the same job twice.
 */
import { prisma } from "@/lib/prisma";
import { backoffSeconds } from "./queue";
import { runJobHandler } from "./handlers";

const INTERVAL_MS = 20_000;
const BATCH_SIZE = 5;

const g = globalThis as unknown as {
  __facturapyJobRunner?: ReturnType<typeof setInterval>;
  __facturapyJobRunning?: boolean;
};

export function startJobRunner(): void {
  if (g.__facturapyJobRunner) return;
  g.__facturapyJobRunner = setInterval(() => {
    void runPendingJobs().catch((err) => console.error("job runner tick failed", err));
  }, INTERVAL_MS);
  // Don't keep the process alive just for the queue.
  if (typeof g.__facturapyJobRunner === "object" && "unref" in g.__facturapyJobRunner) {
    g.__facturapyJobRunner.unref();
  }
  // First tick shortly after boot.
  setTimeout(() => void runPendingJobs().catch(() => undefined), 3_000).unref?.();
}

export async function runPendingJobs(): Promise<{ processed: number }> {
  if (g.__facturapyJobRunning) return { processed: 0 };
  g.__facturapyJobRunning = true;
  let processed = 0;
  try {
    for (let i = 0; i < BATCH_SIZE; i++) {
      const claimed = await claimNextJob();
      if (!claimed) break;
      processed++;
      await executeJob(claimed.id);
    }
  } finally {
    g.__facturapyJobRunning = false;
  }
  return { processed };
}

async function claimNextJob(): Promise<{ id: string } | null> {
  const candidate = await prisma.jobQueue.findFirst({
    where: { status: "PENDING", nextRunAt: { lte: new Date() } },
    orderBy: { nextRunAt: "asc" },
    select: { id: true },
  });
  if (!candidate) return null;
  // Atomic claim — only one runner wins.
  const res = await prisma.jobQueue.updateMany({
    where: { id: candidate.id, status: "PENDING" },
    data: { status: "RUNNING", attempts: { increment: 1 } },
  });
  if (res.count === 0) return claimNextJob();
  return candidate;
}

async function executeJob(id: string): Promise<void> {
  const job = await prisma.jobQueue.findUnique({ where: { id } });
  if (!job) return;
  try {
    await runJobHandler(job.type, job.payload as Record<string, unknown>);
    await prisma.jobQueue.update({
      where: { id },
      data: { status: "DONE", lastError: null },
    });
  } catch (err) {
    const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
    const exhausted = job.attempts >= job.maxAttempts;
    await prisma.jobQueue.update({
      where: { id },
      data: {
        status: exhausted ? "FAILED" : "PENDING",
        lastError: message.slice(0, 8000),
        nextRunAt: new Date(Date.now() + backoffSeconds(job.attempts) * 1000),
      },
    });
    if (exhausted) console.error(`job ${job.type} ${id} failed permanently:`, message);
  }
}
