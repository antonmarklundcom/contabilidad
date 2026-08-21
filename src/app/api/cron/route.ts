import { NextResponse } from "next/server";
import { runPendingJobs } from "@/lib/jobs/runner";
import { enqueueNightlyBackupIfDue } from "@/lib/backup";
import { enqueueDueReminders } from "@/lib/notifications";

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
  // Compliance reminders: due filings, timbrado and certificate expiry. A
  // clean no-op when SMTP is unconfigured, so nothing is marked as sent.
  const reminders = await enqueueDueReminders();
  const { processed } = await runPendingJobs();
  return NextResponse.json({ ok: true, processed, reminders: reminders.enqueued });
}

export const GET = handle;
export const POST = handle;
