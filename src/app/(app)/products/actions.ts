"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { productSchema, type ProductInput } from "@/lib/validators";
import { audit } from "@/lib/audit";
import { allowed } from "@/lib/authz";

export async function saveProduct(
  id: string | null,
  input: ProductInput
): Promise<{ ok: true; id: string } | { ok: false; errors: Record<string, string> }> {
  if (!(await allowed("catalog:write"))) return { ok: false, errors: { form: "forbidden" } };
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] = issue.message;
    return { ok: false, errors };
  }
  const companyId = await getCompanyId();
  const d = parsed.data;
  if (d.moneda === "PYG" && !Number.isInteger(d.precioUnitario)) {
    return { ok: false, errors: { precioUnitario: "pyg_no_decimals" } };
  }
  const data = {
    codigo: d.codigo,
    descripcionEs: d.descripcionEs,
    descripcionEn: d.descripcionEn || null,
    unidadMedida: d.unidadMedida,
    precioUnitario: d.precioUnitario,
    moneda: d.moneda,
    ivaRate: d.ivaRate,
    tipo: d.tipo,
    active: d.active,
  };
  let productId: string;
  try {
    if (id) {
      const existing = await prisma.product.findFirst({ where: { id, companyId } });
      if (!existing) return { ok: false, errors: { _: "not_found" } };
      await prisma.product.update({ where: { id }, data });
      productId = id;
      await audit("update", "product", id);
    } else {
      const created = await prisma.product.create({ data: { ...data, companyId } });
      productId = created.id;
      await audit("create", "product", created.id);
    }
  } catch {
    return { ok: false, errors: { codigo: "duplicate" } };
  }
  revalidatePath("/products");
  return { ok: true, id: productId };
}

export async function deleteProduct(id: string): Promise<{ ok: boolean; reason?: string }> {
  if (!(await allowed("catalog:write"))) return { ok: false, reason: "forbidden" };
  const companyId = await getCompanyId();
  const usage = await prisma.invoiceLine.count({ where: { productId: id } });
  if (usage > 0) {
    // Products referenced by invoices are deactivated, never deleted.
    await prisma.product.updateMany({ where: { id, companyId }, data: { active: false } });
    revalidatePath("/products");
    return { ok: true, reason: "deactivated" };
  }
  await prisma.product.deleteMany({ where: { id, companyId } });
  await audit("delete", "product", id);
  revalidatePath("/products");
  return { ok: true };
}
