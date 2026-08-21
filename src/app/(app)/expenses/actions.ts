"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { expenseSchema, type ExpenseInput } from "@/lib/validators";
import { audit } from "@/lib/audit";
import { allowed } from "@/lib/authz";

/** Duplicate = same supplier + número + fecha + total. */
async function findDuplicate(
  companyId: string,
  supplierRuc: string | null,
  numero: string | null,
  fecha: Date | null,
  total: number,
  excludeId?: string
): Promise<string | null> {
  if (!supplierRuc || !numero || !fecha) return null;
  const dayStart = new Date(fecha);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(fecha);
  dayEnd.setHours(23, 59, 59, 999);
  const dup = await prisma.expense.findFirst({
    where: {
      companyId,
      supplierRuc,
      numeroComprobante: numero,
      fecha: { gte: dayStart, lte: dayEnd },
      total,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return dup?.id ?? null;
}

export async function saveExpense(
  id: string | null,
  input: ExpenseInput,
  opts?: { confirm?: boolean }
): Promise<
  | { ok: true; id: string; duplicateOfId: string | null }
  | { ok: false; errors: Record<string, string> }
> {
  if (!(await allowed("expenses:write"))) return { ok: false, errors: { form: "forbidden" } };
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] = issue.message;
    return { ok: false, errors };
  }
  const companyId = await getCompanyId();
  const d = parsed.data;

  const duplicateOfId = await findDuplicate(
    companyId,
    d.supplierRuc || null,
    d.numeroComprobante || null,
    d.fecha ?? null,
    d.total,
    id ?? undefined
  );

  const data = {
    supplierRuc: d.supplierRuc || null,
    supplierDv: d.supplierDv || null,
    supplierRazonSocial: d.supplierRazonSocial || null,
    timbrado: d.timbrado || null,
    tipoComprobante: d.tipoComprobante || null,
    numeroComprobante: d.numeroComprobante || null,
    fecha: d.fecha ?? null,
    gravada10: d.gravada10,
    gravada5: d.gravada5,
    exenta: d.exenta,
    iva10: d.iva10,
    iva5: d.iva5,
    total: d.total,
    moneda: d.moneda,
    deduciblePercent: d.deduciblePercent,
    categoryId: d.categoryId || null,
    notes: d.notes || null,
    duplicateOfId,
    status: opts?.confirm ? ("CONFIRMED" as const) : undefined,
  };

  const itemsData = d.items.map((item, i) => ({
    orden: i,
    descripcion: item.descripcion,
    cantidad: item.cantidad ?? null,
    total: item.total,
    tasa: item.tasa,
    deduciblePercent: item.deduciblePercent,
    deducibleReason: item.deducibleReason || null,
    aiSuggested: item.aiSuggested,
  }));

  let expenseId: string;
  if (id) {
    const existing = await prisma.expense.findFirst({ where: { id, companyId } });
    if (!existing) return { ok: false, errors: { _: "not_found" } };
    await prisma.$transaction([
      prisma.expense.update({ where: { id }, data }),
      prisma.expenseItem.deleteMany({ where: { expenseId: id } }),
      prisma.expenseItem.createMany({
        data: itemsData.map((item) => ({ ...item, expenseId: id })),
      }),
    ]);
    expenseId = id;
    await audit("update", "expense", id);
  } else {
    const created = await prisma.expense.create({
      data: {
        ...data,
        companyId,
        source: "MANUAL",
        status: opts?.confirm ? "CONFIRMED" : "NEEDS_REVIEW",
        items: { create: itemsData },
      },
    });
    expenseId = created.id;
    await audit("create", "expense", created.id);
  }

  // Remember supplier → category for next time.
  if (opts?.confirm && d.supplierRuc && d.categoryId) {
    await prisma.supplierCategoryMap.upsert({
      where: { companyId_supplierRuc: { companyId, supplierRuc: d.supplierRuc } },
      update: { categoryId: d.categoryId },
      create: { companyId, supplierRuc: d.supplierRuc, categoryId: d.categoryId },
    });
  }

  revalidatePath("/expenses");
  return { ok: true, id: expenseId, duplicateOfId };
}

export async function deleteExpense(id: string): Promise<{ ok: boolean }> {
  if (!(await allowed("expenses:write"))) return { ok: false };
  const companyId = await getCompanyId();
  await prisma.expense.deleteMany({ where: { id, companyId } });
  await audit("delete", "expense", id);
  revalidatePath("/expenses");
  return { ok: true };
}

/** Pre-selects the remembered category for a supplier RUC. */
export async function categoryForSupplier(supplierRuc: string): Promise<string | null> {
  const companyId = await getCompanyId();
  const map = await prisma.supplierCategoryMap.findUnique({
    where: { companyId_supplierRuc: { companyId, supplierRuc } },
  });
  return map?.categoryId ?? null;
}

/** Bulk-imports pre-parsed Marangatu rows as CONFIRMED expenses (no OCR needed — already structured). */
export async function importMarangatuRows(
  rows: import("@/lib/marangatu-import").MarangatuRow[]
): Promise<{ created: number; skipped: number }> {
  if (!(await allowed("expenses:write"))) return { created: 0, skipped: 0 };
  const companyId = await getCompanyId();
  let created = 0;
  let skipped = 0;

  for (const r of rows) {
    const dup = await findDuplicate(companyId, r.supplierRuc, r.numeroComprobante, r.fecha, r.total);
    if (dup) {
      skipped++;
      continue;
    }
    const suggestedCategory = r.supplierRuc ? await categoryForSupplier(r.supplierRuc) : null;
    await prisma.expense.create({
      data: {
        companyId,
        source: "IMPORT",
        status: "NEEDS_REVIEW",
        supplierRuc: r.supplierRuc,
        supplierDv: r.supplierDv,
        supplierRazonSocial: r.supplierRazonSocial,
        timbrado: r.timbrado,
        tipoComprobante: r.tipoComprobante,
        numeroComprobante: r.numeroComprobante,
        fecha: r.fecha,
        gravada10: r.gravada10,
        gravada5: r.gravada5,
        exenta: r.exenta,
        iva10: r.iva10,
        iva5: r.iva5,
        total: r.total,
        moneda: r.moneda,
        categoryId: suggestedCategory,
      },
    });
    created++;
  }

  await audit("create", "expense_import", undefined, { created, skipped });
  revalidatePath("/expenses");
  return { created, skipped };
}
