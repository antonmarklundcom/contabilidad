"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCompanyId } from "@/lib/company";
import { setSaldoAnterior, buildForm120, closePeriod, reopenPeriod } from "@/lib/form120";
import { buildReconciliation } from "@/lib/reconcile";
import { audit } from "@/lib/audit";
import { markSubmitted, markPaid, setFilingNotes } from "@/lib/tax/filing";
import { filingTransitionSchema, filingNotesSchema } from "@/lib/validators";
import { enqueueJob } from "@/lib/jobs/queue";

export async function saveSaldoAnterior(
  year: number,
  month: number,
  value: number
): Promise<{ ok: boolean }> {
  if (!Number.isFinite(value) || value < 0) return { ok: false };
  const companyId = await getCompanyId();
  await setSaldoAnterior(companyId, year, month, Math.round(value));
  await audit("update", "form120", `${year}-${String(month).padStart(2, "0")}`, {
    saldoAnterior: Math.round(value),
  });
  revalidatePath("/taxes");
  return { ok: true };
}

export async function closePeriodAction(
  year: number,
  month: number
): Promise<{ ok: boolean; error?: string }> {
  const companyId = await getCompanyId();
  const reconciliation = await buildReconciliation(companyId, year, month);
  if (!reconciliation.clean) {
    return { ok: false, error: "unresolved" };
  }
  const session = await getServerSession(authOptions);
  const closedBy = session?.user?.email ?? session?.user?.name ?? "unknown";
  const snapshot = await buildForm120(companyId, year, month);
  const result = await closePeriod(companyId, year, month, closedBy, snapshot);
  if (!result.ok) {
    // The filing was already presented to DNIT: its snapshot is a declared
    // fact and must not be rewritten.
    await audit("close_refused", "form120", `${year}-${String(month).padStart(2, "0")}`, {
      status: result.status,
    });
    return { ok: false, error: "locked" };
  }
  await audit("close", "form120", `${year}-${String(month).padStart(2, "0")}`, {
    closedBy,
    aPagar: snapshot.aPagar,
    saldoAFavor: snapshot.saldoAFavor,
  });
  // Deliver the close report by email. Queued, not inline: a slow or missing
  // SMTP host must never make closing a period fail.
  await enqueueJob("send_report", { companyId, year, month });
  revalidatePath("/taxes");
  revalidatePath("/taxes/historial");
  return { ok: true };
}

export async function reopenPeriodAction(
  year: number,
  month: number
): Promise<{ ok: boolean; error?: string }> {
  const companyId = await getCompanyId();
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const result = await reopenPeriod(companyId, year, month);
  if (!result.ok) {
    await audit("reopen_refused", "form120", period, { status: result.status });
    return { ok: false, error: "locked" };
  }
  await audit("reopen", "form120", period);
  revalidatePath("/taxes");
  revalidatePath("/taxes/historial");
  return { ok: true };
}

/**
 * Filing status transitions (Phase 5). Each validates with zod, is scoped to
 * the session's company inside the lib layer, revalidates and audits.
 *
 * A transition that matches no row (wrong id, wrong company, or a status the
 * transition is not legal from) returns ok:false rather than silently
 * succeeding — these are tax-record changes and must not be lossy.
 */
export async function markSubmittedAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = filingTransitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const companyId = await getCompanyId();
  const count = await markSubmitted(companyId, parsed.data.filingId, parsed.data.at);
  if (count === 0) return { ok: false, error: "not_found" };
  await audit("submit", "taxFiling", parsed.data.filingId, {
    submittedAt: (parsed.data.at ?? new Date()).toISOString(),
  });
  revalidatePath("/taxes");
  revalidatePath("/taxes/historial");
  revalidatePath("/");
  return { ok: true };
}

export async function markPaidAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = filingTransitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const companyId = await getCompanyId();
  const count = await markPaid(companyId, parsed.data.filingId, parsed.data.at);
  if (count === 0) return { ok: false, error: "not_found" };
  await audit("pay", "taxFiling", parsed.data.filingId, {
    paidAt: (parsed.data.at ?? new Date()).toISOString(),
  });
  revalidatePath("/taxes");
  revalidatePath("/taxes/historial");
  revalidatePath("/");
  return { ok: true };
}

export async function saveFilingNotesAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = filingNotesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const companyId = await getCompanyId();
  const count = await setFilingNotes(companyId, parsed.data.filingId, parsed.data.notes);
  if (count === 0) return { ok: false, error: "not_found" };
  await audit("update", "taxFiling", parsed.data.filingId, { notes: true });
  revalidatePath("/taxes/historial");
  return { ok: true };
}
