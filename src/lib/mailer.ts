import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function getTransport() {
  if (!smtpConfigured()) {
    throw new Error(
      "SMTP is not configured (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)",
    );
  }
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

export async function testSmtp(): Promise<void> {
  await getTransport().verify();
}

export async function sendInvoiceEmail(opts: {
  to: string;
  subject: string;
  text: string;
  attachments: { path: string; filename?: string }[];
}): Promise<void> {
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    attachments: opts.attachments
      .filter((a) => fs.existsSync(a.path))
      .map((a) => ({
        path: a.path,
        filename: a.filename ?? path.basename(a.path),
      })),
  });
}

/**
 * A plain text email with no attachments.
 *
 * Used by the marketing contact form (PLAN Phase 9.3), which has no invoice
 * and no session behind it — it must not reuse `sendInvoiceEmail`, whose
 * attachment handling silently drops missing paths.
 */
export async function sendPlainEmail(opts: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<void> {
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
  });
}
