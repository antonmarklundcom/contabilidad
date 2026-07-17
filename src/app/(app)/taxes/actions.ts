"use server";

import { revalidatePath } from "next/cache";
import { getCompanyId } from "@/lib/company";
import { setSaldoAnterior } from "@/lib/form120";
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
