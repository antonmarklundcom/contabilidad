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

/** Bulk-imports pre-parsed Marangatu rows as NEEDS_REVIEW expenses (no OCR needed — already structured; a human still confirms). */
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


/* ── e-Kuatiá DE XML import (PLAN Phase 3.1 + 3.3) ───────────────────────── */

export interface DeImportResult {
  /** New expenses recorded from a DE with no counterpart in the books. */
  created: number;
  /** DEs merged into an expense that was already captured (usually by OCR). */
  merged: number;
  /** DEs whose CDC we already hold — a re-import, not a new document. */
  skipped: number;
  /**
   * A DE that disagrees on the amounts with an expense a HUMAN already
   * confirmed. Never overwritten silently; flagged for someone to look at.
   */
  conflicts: number;
  /** DEs issued to a different RUC — someone else's purchase. */
  foreign: number;
}

/**
 * Finds the expense that IS this document, if we already have it.
 *
 * Matched on issuer RUC + document number, deliberately NOT on the amount.
 * `findDuplicate` includes the total because two captures of the same
 * comprobante should agree; here the whole point is that they may not — an
 * OCR read of a creased receipt gets the total wrong, and matching on it
 * would miss the twin and book the purchase twice. A given issuer cannot
 * reuse a number, so RUC + número is the document's identity.
 */
async function findDeTwin(
  companyId: string,
  supplierRuc: string,
  numeroComprobante: string
): Promise<string | null> {
  const twin = await prisma.expense.findFirst({
    where: { companyId, supplierRuc, numeroComprobante },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return twin?.id ?? null;
}

/**
 * Records downloaded e-Kuatiá documents as expenses, merging with what we
 * already have rather than duplicating it.
 *
 * The XML is the highest-fidelity source we can get for a received document,
 * so where it meets an OCR capture the electronic figures win — **unless a
 * human already confirmed that expense**, in which case the amounts are left
 * exactly as signed off and the disagreement is reported instead. A reviewed
 * figure is not something an import gets to rewrite; see PLAN Phase 5.10 for
 * the same rule one level up.
 *
 * Importing an XML is NOT the same as verifying it: the CDC is stored so the
 * Phase 5.8 consulta is one click away, but no verdict is claimed, because
 * nobody asked SIFEN.
 */
export async function importDeDocuments(
  documents: import("@/lib/ekuatia-xml").ParsedDe[]
): Promise<DeImportResult> {
  const empty: DeImportResult = { created: 0, merged: 0, skipped: 0, conflicts: 0, foreign: 0 };
  if (!(await allowed("expenses:write"))) return empty;
  const companyId = await getCompanyId();
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { ruc: true, dv: true },
  });
  const { isIssuedTo } = await import("@/lib/ekuatia-xml");

  const result = { ...empty };

  for (const de of documents) {
    if (company && !isIssuedTo(de, company.ruc)) {
      result.foreign++;
      continue;
    }

    // Idempotent: the same file dropped twice is one document, not two.
    const already = await prisma.expense.findFirst({
      where: { companyId, cdc: de.cdc },
      select: { id: true },
    });
    if (already) {
      result.skipped++;
      continue;
    }

    const twinId = await findDeTwin(companyId, de.supplierRuc, de.numeroComprobante);
    const amounts = {
      gravada10: de.gravada10,
      gravada5: de.gravada5,
      exenta: de.exenta,
      iva10: de.iva10,
      iva5: de.iva5,
      total: de.total,
      moneda: de.moneda,
      fecha: de.fecha,
    };

    if (twinId) {
      const twin = await prisma.expense.findUniqueOrThrow({ where: { id: twinId } });
      const differs = Number(twin.total) !== de.total;
      const reviewed = twin.status === "CONFIRMED";

      if (differs && reviewed) {
        // Enrich the empty fields, never the declared figures.
        await prisma.expense.update({
          where: { id: twin.id },
          data: {
            cdc: de.cdc,
            timbrado: twin.timbrado ?? de.timbrado,
            supplierRazonSocial: twin.supplierRazonSocial ?? de.supplierRazonSocial,
            notes: [
              twin.notes,
              `DE electrónico ${de.cdc}: total ${de.total} ${de.moneda} (registrado ${Number(twin.total)}).`,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        });
        result.conflicts++;
        continue;
      }

      await prisma.expense.update({
        where: { id: twin.id },
        data: {
          ...amounts,
          cdc: de.cdc,
          source: "IMPORT",
          timbrado: de.timbrado ?? twin.timbrado,
          supplierDv: de.supplierDv,
          supplierRazonSocial: de.supplierRazonSocial || twin.supplierRazonSocial,
          tipoComprobante: de.tipoComprobante,
          // The electronic lines replace an OCR guess at them; the human's
          // category and notes on the expense are left alone.
          ...(de.items.length > 0
            ? {
                items: {
                  deleteMany: {},
                  create: de.items.map((item, i) => ({
                    orden: i + 1,
                    descripcion: item.descripcion,
                    cantidad: item.cantidad ?? undefined,
                    total: item.total,
                    tasa: item.tasa,
                    deduciblePercent: 100,
                  })),
                },
              }
            : {}),
        },
      });
      result.merged++;
      continue;
    }

    const suggestedCategory = await categoryForSupplier(de.supplierRuc);
    await prisma.expense.create({
      data: {
        companyId,
        source: "IMPORT",
        // Electronic and structured, but still a human's call whether it is
        // deductible and to which category — same stance as OCR intake.
        status: "NEEDS_REVIEW",
        supplierRuc: de.supplierRuc,
        supplierDv: de.supplierDv,
        supplierRazonSocial: de.supplierRazonSocial,
        timbrado: de.timbrado,
        tipoComprobante: de.tipoComprobante,
        numeroComprobante: de.numeroComprobante,
        cdc: de.cdc,
        categoryId: suggestedCategory,
        ...amounts,
        items: {
          create: de.items.map((item, i) => ({
            orden: i + 1,
            descripcion: item.descripcion,
            cantidad: item.cantidad ?? undefined,
            total: item.total,
            tasa: item.tasa,
            deduciblePercent: 100,
          })),
        },
      },
    });
    result.created++;
  }

  await audit("create", "expense_import_xml", undefined, { ...result });
  revalidatePath("/expenses");
  return result;
}
