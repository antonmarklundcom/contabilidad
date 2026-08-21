import { NextResponse } from "next/server";
import { runPendingJobs } from "@/lib/jobs/runner";
import { enqueueNightlyBackupIfDue } from "@/lib/backup";
import { enqueueDueReminders } from "@/lib/notifications";
import { precomputeMonthEndDrafts } from "@/lib/tax/precompute";

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
  // The draft for the month that just ended is computed here rather than on
  // first page view, so it is already waiting at login.
  const drafts = await precomputeMonthEndDrafts();
  const { processed } = await runPendingJobs();
  return NextResponse.json({
    ok: true,
    processed,
    reminders: reminders.enqueued,
    drafts: drafts.computed,
  });
}

export const GET = handle;
export const POST = handle;
