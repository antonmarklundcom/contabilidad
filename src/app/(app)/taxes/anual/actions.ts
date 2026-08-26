"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCompanyId } from "@/lib/company";
import { allowed } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { buildIrp, getIrpRegime, setIrpRegime, IRP_REGIMES } from "@/lib/irp";
import { buildAnnualReconciliation } from "@/lib/reconcile";
import { closeAnnualFiling, reopenAnnualFiling } from "@/lib/tax/filing";
import { irpRegimeSchema, irpYearSchema } from "@/lib/validators";

/**
 * The annual IRP close (PLAN Phase 7.2) — deliberately the same shape as
 * `closePeriodAction`: capability check, reconciliation gate, human sign-off
 * recorded on an immutable snapshot, audit, revalidate.
 */

export type AnnualCloseError = "forbidden" | "invalid" | "unresolved" | "locked" | "no_regime" | "stub_regime";

/** Records which IRP regime the taxpayer is in. Nothing infers this. */
export async function saveIrpRegimeAction(
  input: unknown
): Promise<{ ok: boolean; error?: AnnualCloseError }> {
  if (!(await allowed("taxes:close"))) return { ok: false, error: "forbidden" };
  const parsed = irpRegimeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const companyId = await getCompanyId();
  await setIrpRegime(companyId, parsed.data.regime);
  await audit("update", "irp", "regime", { regime: parsed.data.regime });
  revalidatePath("/taxes/anual");
  return { ok: true };
}

export async function closeAnnualAction(
  input: unknown
): Promise<{ ok: boolean; error?: AnnualCloseError }> {
  if (!(await allowed("taxes:close"))) return { ok: false, error: "forbidden" };
  const parsed = irpYearSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { year } = parsed.data;
  const companyId = await getCompanyId();

  // The regime must have been declared, not previewed: a snapshot is a
  // statement about a taxpayer, and which tax they are under is part of it.
  const regime = await getIrpRegime(companyId);
  if (!regime) return { ok: false, error: "no_regime" };
  // And it must be one whose rules were actually confirmed. RGC ships as a
  // scaffold so the engine is genuinely regime-parameterized; signing off on
  // figures derived from unconfirmed rules is exactly what this app refuses
  // to let a competitor do (STRATEGY §"never wrong").
  if (IRP_REGIMES[regime].status === "stub") {
    await audit("close_refused", "irp", String(year), { regime, reason: "stub_regime" });
    return { ok: false, error: "stub_regime" };
  }

  const reconciliation = await buildAnnualReconciliation(companyId, year);
  if (!reconciliation.clean) return { ok: false, error: "unresolved" };

  const session = await getServerSession(authOptions);
  const closedBy = session?.user?.email ?? session?.user?.name ?? "unknown";
  const snapshot = await buildIrp(companyId, year, regime);
  const result = await closeAnnualFiling(companyId, year, closedBy, snapshot);
  if (!result.ok) {
    await audit("close_refused", "irp", String(year), { status: result.status });
    return { ok: false, error: "locked" };
  }

  await audit("close", "irp", String(year), {
    closedBy,
    regime,
    rentaNetaImponible: snapshot.rentaNetaImponible,
    impuesto: snapshot.impuesto,
  });
  revalidatePath("/taxes/anual");
  revalidatePath("/taxes/historial");
  return { ok: true };
}

export async function reopenAnnualAction(
  input: unknown
): Promise<{ ok: boolean; error?: AnnualCloseError }> {
  if (!(await allowed("taxes:close"))) return { ok: false, error: "forbidden" };
  const parsed = irpYearSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { year } = parsed.data;
  const companyId = await getCompanyId();

  const result = await reopenAnnualFiling(companyId, year);
  if (!result.ok) {
    await audit("reopen_refused", "irp", String(year), { status: result.status });
    return { ok: false, error: "locked" };
  }
  await audit("reopen", "irp", String(year));
  revalidatePath("/taxes/anual");
  revalidatePath("/taxes/historial");
  return { ok: true };
}
