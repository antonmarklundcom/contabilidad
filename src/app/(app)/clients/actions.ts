"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { clientSchema, type ClientInput } from "@/lib/validators";
import { audit } from "@/lib/audit";

export async function saveClient(
  id: string | null,
  input: ClientInput
): Promise<{ ok: true; id: string } | { ok: false; errors: Record<string, string> }> {
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[issue.path.join(".")] = issue.message;
    }
    return { ok: false, errors };
  }
  const companyId = await getCompanyId();
  const d = parsed.data;
  const data = {
    docType: d.docType,
    ruc: d.docType === "RUC" ? d.ruc || null : null,
    dv: d.docType === "RUC" ? d.dv || null : null,
    documentoNumero:
      d.docType === "CI" || d.docType === "PASAPORTE" ? d.documentoNumero || null : null,
    razonSocial: d.razonSocial,
    nombreFantasia: d.nombreFantasia || null,
    email: d.email || null,
    telefono: d.telefono || null,
    direccion: d.direccion || null,
    pais: d.pais,
    paisDescripcion: d.paisDescripcion,
    isTaxpayer: d.docType === "RUC" ? d.isTaxpayer : false,
    tipoContribuyente: d.docType === "RUC" ? (d.tipoContribuyente ?? 1) : null,
    notes: d.notes || null,
  };
  let clientId: string;
  if (id) {
    const existing = await prisma.client.findFirst({ where: { id, companyId } });
    if (!existing) return { ok: false, errors: { _: "not_found" } };
    await prisma.client.update({ where: { id }, data });
    clientId = id;
    await audit("update", "client", id);
  } else {
    const created = await prisma.client.create({ data: { ...data, companyId } });
    clientId = created.id;
    await audit("create", "client", created.id);
  }
  revalidatePath("/clients");
  return { ok: true, id: clientId };
}

export async function deleteClient(
  id: string
): Promise<{ ok: boolean; reason?: string }> {
  const companyId = await getCompanyId();
  const invoiceCount = await prisma.invoice.count({ where: { clientId: id, companyId } });
  if (invoiceCount > 0) return { ok: false, reason: "has_invoices" };
  await prisma.client.deleteMany({ where: { id, companyId } });
  await audit("delete", "client", id);
  revalidatePath("/clients");
  return { ok: true };
}
