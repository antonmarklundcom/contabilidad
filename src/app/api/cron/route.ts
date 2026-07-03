import { NextResponse } from "next/server";
import { runPendingJobs } from "@/lib/jobs/runner";
import { enqueueNightlyBackupIfDue } from "@/lib/backup";

/**
 * External cron entry point. Protect with the x-cron-secret header:
 *   curl -H "x-cron-secret: $CRON_SECRET" https://app.example.com/api/cron
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("x-cron-secret");
  if (!secret || header !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await enqueueNightlyBackupIfDue();
  const { processed } = await runPendingJobs();
  return NextResponse.json({ ok: true, processed });
}

export const GET = handle;
export const POST = handle;
