"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCompanyId } from "@/lib/company";
import {
  setSaldoAnterior,
  buildForm120,
  closePeriod,
  reopenPeriod,
  carryForwardSaldo,
} from "@/lib/form120";
import { buildReconciliation } from "@/lib/reconcile";
import { generateCloseArtifacts } from "@/lib/tax-close";
import { enqueueJob } from "@/lib/jobs/queue";
import { smtpConfigured } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

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
  const files = await generateCloseArtifacts(companyId, snapshot);
  await closePeriod(companyId, year, month, closedBy, snapshot, files);
  // Seed next month's saldo anterior so nobody retypes (and mistypes) it.
  await carryForwardSaldo(companyId, year, month, snapshot.saldoAFavor);
  await audit("close", "form120", `${year}-${String(month).padStart(2, "0")}`, {
    closedBy,
    aPagar: snapshot.aPagar,
    saldoAFavor: snapshot.saldoAFavor,
    files,
  });
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (smtpConfigured() && company?.email) {
    await enqueueJob("send_report", { companyId, year, month });
  }
  revalidatePath("/taxes");
  return { ok: true };
}

export async function reopenPeriodAction(year: number, month: number): Promise<{ ok: boolean }> {
  const companyId = await getCompanyId();
  await reopenPeriod(companyId, year, month);
  await audit("reopen", "form120", `${year}-${String(month).padStart(2, "0")}`);
  revalidatePath("/taxes");
  return { ok: true };
}
