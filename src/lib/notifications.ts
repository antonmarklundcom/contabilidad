/**
 * Compliance reminders — filing deadlines, timbrado expiry, certificate expiry.
 *
 * PLAN Phase 5.6. The scan (`enqueueDueReminders`) runs from `/api/cron`; the
 * sending is a `filing_reminder` job so a flaky SMTP host retries with the
 * queue's backoff instead of dropping the reminder.
 *
 * Two rules keep this honest:
 *
 * 1. **Never twice.** `NotificationLog` is unique on
 *    `(companyId, kind, subject, threshold)` and the scan *inserts first*: a
 *    unique violation means another runner already claimed that reminder, the
 *    same way the job runner claims jobs with an atomic `updateMany`. The row
 *    is deleted again if the enqueue fails, so a failed scan retries later
 *    rather than silently swallowing the reminder.
 * 2. **Clean no-op without SMTP.** With no mailer configured nothing is
 *    logged and nothing is queued, so reminders start flowing the day SMTP is
 *    set up instead of being permanently marked as sent.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { smtpConfigured, sendInvoiceEmail } from "@/lib/mailer";
import { enqueueJob } from "@/lib/jobs/queue";
import { daysUntil } from "@/lib/tax/calendar";
import { nextDeadline } from "@/lib/tax/deadline";
import { getDict, normalizeLocale, translate, type Locale } from "@/lib/i18n";

/** What is expiring. Also the `NotificationLog.kind` value. */
export type ReminderKind = "filing_due" | "timbrado_expiry" | "cert_expiry";

/**
 * Days-before-due at which a reminder goes out.
 *
 * Filings get a short ladder because the period is a recurring monthly ritual;
 * expiries get a long one because renewing a timbrado or a certificate means
 * paperwork with DNIT, which takes weeks.
 */
export const FILING_THRESHOLDS: readonly number[] = [10, 3, 1];
export const EXPIRY_THRESHOLDS: readonly number[] = [60, 30, 7];

/**
 * Which threshold a given "days remaining" falls into, or null when the date
 * is still further out than the widest threshold.
 *
 * The smallest threshold that still covers `daysRemaining` wins, so each
 * threshold fires exactly once as the date approaches: with [10, 3, 1], day 10
 * fires 10, days 9–4 re-derive 10 (already logged, so nothing is sent), day 3
 * fires 3, and days 1 and later — including overdue — fire 1. Pure and
 * fixture-tested; the dedup that turns "derived" into "sent once" is the
 * NotificationLog insert.
 */
export function reminderThreshold(
  daysRemaining: number,
  thresholds: readonly number[]
): number | null {
  const covering = thresholds.filter((t) => t >= daysRemaining);
  if (covering.length === 0) return null;
  return Math.min(...covering);
}

/** Stable identifier of the *thing* expiring, so a renewal alerts afresh. */
export function reminderSubject(kind: ReminderKind, value: string): string {
  return `${kind}:${value}`;
}

export interface PlannedReminder {
  companyId: string;
  kind: ReminderKind;
  subject: string;
  threshold: number;
  dueDate: Date;
  daysRemaining: number;
  /** Interpolated into the message: the period label, timbrado number, etc. */
  detail: string;
}

/**
 * What a company is owed right now, before dedup.
 *
 * Pure-ish: it reads the company row and its filings but decides nothing about
 * having sent anything. Split out from `enqueueDueReminders` so the decision
 * logic can be exercised without a mailer.
 */
export async function plannedReminders(
  companyId: string,
  now: Date = new Date()
): Promise<PlannedReminder[]> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      timbradoNumero: true,
      timbradoFechaFin: true,
      certExpiresAt: true,
    },
  });
  if (!company) return [];

  const planned: PlannedReminder[] = [];

  // 1. The next IVA filing this company still owes. A filing already marked
  //    SUBMITTED or PAID is not a deadline any more — `nextDeadline` moves on
  //    to the following period on its own.
  const deadline = await nextDeadline(companyId, now);
  if (deadline && deadline.status !== "SUBMITTED" && deadline.status !== "PAID") {
    const period = `${deadline.year}-${String(deadline.month).padStart(2, "0")}`;
    const threshold = reminderThreshold(deadline.daysRemaining, FILING_THRESHOLDS);
    if (threshold !== null) {
      planned.push({
        companyId,
        kind: "filing_due",
        subject: reminderSubject("filing_due", `IVA:${period}`),
        threshold,
        dueDate: deadline.dueDate,
        daysRemaining: deadline.daysRemaining,
        detail: period,
      });
    }
  }

  // 2. Timbrado expiry — nullable, because a company that never recorded the
  //    end date simply gets no timbrado reminders.
  if (company.timbradoFechaFin) {
    const daysRemaining = daysUntil(company.timbradoFechaFin, now);
    const threshold = reminderThreshold(daysRemaining, EXPIRY_THRESHOLDS);
    if (threshold !== null) {
      planned.push({
        companyId,
        kind: "timbrado_expiry",
        subject: reminderSubject(
          "timbrado_expiry",
          `${company.timbradoNumero}:${company.timbradoFechaFin.toISOString().slice(0, 10)}`
        ),
        threshold,
        dueDate: company.timbradoFechaFin,
        daysRemaining,
        detail: company.timbradoNumero,
      });
    }
  }

  // 3. Certificate expiry — already populated by the cert upload (node-forge).
  if (company.certExpiresAt) {
    const daysRemaining = daysUntil(company.certExpiresAt, now);
    const threshold = reminderThreshold(daysRemaining, EXPIRY_THRESHOLDS);
    if (threshold !== null) {
      planned.push({
        companyId,
        kind: "cert_expiry",
        subject: reminderSubject(
          "cert_expiry",
          company.certExpiresAt.toISOString().slice(0, 10)
        ),
        threshold,
        dueDate: company.certExpiresAt,
        daysRemaining,
        detail: company.certExpiresAt.toISOString().slice(0, 10),
      });
    }
  }

  return planned;
}

export interface ReminderScanResult {
  enqueued: number;
  /** Set when the scan did nothing on purpose. */
  skipped?: "no_smtp";
}

/**
 * Scans every company and queues the reminders that are due and not yet sent.
 *
 * Called from `/api/cron`; safe to call as often as the cron fires, because
 * the NotificationLog insert is what decides whether a reminder is new.
 */
export async function enqueueDueReminders(now: Date = new Date()): Promise<ReminderScanResult> {
  if (!smtpConfigured()) return { enqueued: 0, skipped: "no_smtp" };

  const companies = await prisma.company.findMany({ select: { id: true } });
  let enqueued = 0;

  for (const { id: companyId } of companies) {
    const planned = await plannedReminders(companyId, now);
    for (const reminder of planned) {
      const recipients = await reminderRecipients(companyId);
      if (recipients.length === 0) continue;

      // Insert first: the unique constraint is the lock.
      let logId: string;
      try {
        const log = await prisma.notificationLog.create({
          data: {
            companyId,
            kind: reminder.kind,
            subject: reminder.subject,
            threshold: reminder.threshold,
            recipient: recipients.join(", "),
          },
        });
        logId = log.id;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          continue; // Already sent (or being sent) — never twice.
        }
        throw err;
      }

      try {
        await enqueueJob("filing_reminder", {
          companyId,
          kind: reminder.kind,
          subject: reminder.subject,
          threshold: reminder.threshold,
          dueDate: reminder.dueDate.toISOString(),
          detail: reminder.detail,
        });
        enqueued++;
      } catch (err) {
        // The claim is only worth keeping if the work was actually queued.
        await prisma.notificationLog.delete({ where: { id: logId } }).catch(() => {});
        throw err;
      }
    }
  }

  return { enqueued };
}

/**
 * Who hears about it: the company's own email address plus its users.
 *
 * Client-role users are excluded — a timbrado renewal is the owner's and the
 * bookkeeper's problem, not something to push at a read-only portal user.
 */
export async function reminderRecipients(companyId: string): Promise<string[]> {
  const [company, users] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { email: true } }),
    prisma.user.findMany({
      where: { companyId, role: { in: ["admin", "accountant"] } },
      select: { email: true },
    }),
  ]);
  const all = [company?.email, ...users.map((u) => u.email)].filter(
    (e): e is string => Boolean(e && e.includes("@"))
  );
  return [...new Set(all)];
}

/** The locale a company's reminders are written in: its first user's. */
async function companyLocale(companyId: string): Promise<Locale> {
  const user = await prisma.user.findFirst({
    where: { companyId },
    orderBy: { createdAt: "asc" },
    select: { locale: true },
  });
  return normalizeLocale(user?.locale);
}

export interface ReminderPayload {
  companyId: string;
  kind: ReminderKind;
  dueDate: string;
  detail: string;
}

/**
 * `filing_reminder` job handler: renders and sends one reminder email.
 *
 * Re-derives everything from the payload's identifiers rather than trusting a
 * body built at scan time, and no-ops when SMTP disappeared in the meantime.
 */
export async function sendReminderEmail(payload: ReminderPayload): Promise<void> {
  if (!smtpConfigured()) return;

  const recipients = await reminderRecipients(payload.companyId);
  if (recipients.length === 0) return;

  const company = await prisma.company.findUnique({
    where: { id: payload.companyId },
    select: { razonSocial: true },
  });
  const locale = await companyLocale(payload.companyId);
  const dict = getDict(locale);
  const dueDate = new Date(payload.dueDate);
  const vars = {
    company: company?.razonSocial ?? "",
    detail: payload.detail,
    date: dueDate.toISOString().slice(0, 10),
    days: daysUntil(dueDate),
  };

  const subject = translate(dict, `notifications.${payload.kind}.subject`, vars);
  const body = [
    translate(dict, `notifications.${payload.kind}.body`, vars),
    "",
    translate(dict, "notifications.footer", vars),
  ].join("\n");

  await sendInvoiceEmail({
    to: recipients.join(", "),
    subject,
    text: body,
    attachments: [],
  });
}
