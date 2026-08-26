"use server";

import { headers } from "next/headers";
import { FIRM } from "@/lib/marketing/firm";
import {
  formatLeadEmail,
  hasReplyChannel,
  leadSchema,
  rateLimitLead,
} from "@/lib/marketing/lead";
import { sendPlainEmail, smtpConfigured } from "@/lib/mailer";

export type LeadResult = { ok: true } | { ok: false; error: string };

/**
 * The public contact form (PLAN Phase 9.3).
 *
 * Session-less by design and therefore **not** guarded by `allowed()` — there
 * is no session to hold a capability. The guarantee is swapped, not dropped,
 * and `tests/roles.test.ts` asserts the swap: this action rate-limits the
 * caller and never reaches company data. It writes no row; a lead is an email
 * to the firm, never a `Client` or `Company` record a stranger could create.
 */
export async function submitLeadAction(formData: FormData): Promise<LeadResult> {
  const parsed = leadSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    company: formData.get("company") ?? "",
    subject: formData.get("subject") ?? "",
    message: formData.get("message") ?? "",
    website: formData.get("website") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos del formulario." };
  }
  const lead = parsed.data;

  // A filled honeypot is a bot. Answer as if it worked: telling a script it
  // was detected only teaches it to try again differently.
  if (lead.website) return { ok: true };

  if (!hasReplyChannel(lead)) {
    return { ok: false, error: "Dejanos un correo o un teléfono para poder responderte." };
  }

  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip") ||
    "desconocida";
  if (!rateLimitLead(ip)) {
    return { ok: false, error: "Recibimos varios mensajes desde aquí. Probá de nuevo más tarde." };
  }

  const to = FIRM.email;
  if (!to || !smtpConfigured()) {
    // Never accept a message we cannot deliver.
    return {
      ok: false,
      error: "El formulario todavía no está habilitado. Escribinos por WhatsApp y te respondemos.",
    };
  }

  try {
    await sendPlainEmail({
      to,
      subject: `Consulta web: ${lead.subject || lead.name}`,
      text: formatLeadEmail(lead),
      ...(lead.email ? { replyTo: lead.email } : {}),
    });
  } catch {
    return { ok: false, error: "No pudimos enviar el mensaje. Escribinos por WhatsApp." };
  }

  return { ok: true };
}
