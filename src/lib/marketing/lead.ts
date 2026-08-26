/**
 * The contact form's server-side half (PLAN Phase 9.3).
 *
 * This is the marketing site's only write path, and it is reachable by
 * anyone on the internet with no session at all. The rules that keep that
 * safe, in order of importance:
 *
 * 1. **It never touches company data.** A lead is an email to the firm — it
 *    is explicitly *not* a `Client` or `Company` row, so a stranger cannot
 *    create records inside a tenant. There is no Prisma import here, on
 *    purpose, and `tests/roles.test.ts` asserts it stays that way.
 * 2. **Validation is local**, like every other input in this codebase: zod
 *    first, then the length and shape checks below.
 * 3. **It is rate limited** per IP, because the alternative is our own SMTP
 *    relaying whatever a script wants to send.
 * 4. **It never claims to have delivered what it did not.** With no SMTP
 *    configured the form refuses the submission and points at WhatsApp,
 *    rather than accepting a message into nowhere.
 */

import { z } from "zod";

export const leadSchema = z.object({
  name: z.string().trim().min(2, "Escribí tu nombre").max(120),
  email: z
    .string()
    .trim()
    .email("Revisá el correo")
    .max(180)
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  subject: z.string().trim().max(120).optional().or(z.literal("")),
  message: z.string().trim().min(10, "Contanos un poco más").max(4000),
  /** Honeypot: a real person never sees this field, so a filled one is a bot. */
  website: z.string().max(0).optional().or(z.literal("")),
});

export type LeadInput = z.infer<typeof leadSchema>;

/** At least one way to answer, or the message is undeliverable by definition. */
export function hasReplyChannel(input: LeadInput): boolean {
  return Boolean(input.email) || Boolean(input.phone);
}

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const attempts = new Map<string, number[]>();

/**
 * Best-effort per-IP throttle.
 *
 * In-process and therefore lost on restart — deliberately not a database
 * table, because a public endpoint that writes a row per request is the
 * abuse vector, not the defence. Returns false when the caller is over the
 * limit.
 */
export function rateLimitLead(key: string, now = Date.now()): boolean {
  const recent = (attempts.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    attempts.set(key, recent);
    return false;
  }
  recent.push(now);
  attempts.set(key, recent);
  // Bound the map: a busy day must not turn into unbounded memory.
  if (attempts.size > 5000) {
    for (const [entry, times] of attempts) {
      if (times.every((at) => now - at >= WINDOW_MS)) attempts.delete(entry);
    }
  }
  return true;
}

/** Only for tests: forget every recorded attempt. */
export function resetLeadRateLimit(): void {
  attempts.clear();
}

/** The email body sent to the firm. Plain text — it is read on a phone. */
export function formatLeadEmail(input: LeadInput): string {
  return [
    `Nombre:   ${input.name}`,
    `Correo:   ${input.email || "—"}`,
    `Teléfono: ${input.phone || "—"}`,
    `Empresa:  ${input.company || "—"}`,
    `Asunto:   ${input.subject || "Consulta desde el sitio"}`,
    "",
    input.message,
    "",
    "— Enviado desde el formulario de contacto de contador.com.py",
  ].join("\n");
}
