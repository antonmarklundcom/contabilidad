"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { invoiceSchema, type InvoiceInput } from "@/lib/validators";
import { computeInvoiceTotals } from "@/lib/money";
import { emitInvoice, cancelInvoice, cancelWindowOpen } from "@/lib/dte";
import { enqueueJob } from "@/lib/jobs/queue";
import { runPendingJobs } from "@/lib/jobs/runner";
import { audit } from "@/lib/audit";
import { sendInvoiceEmail, smtpConfigured } from "@/lib/mailer";
import { allowed } from "@/lib/authz";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; errors?: Record<string, string> };

function lineData(input: InvoiceInput) {
  return input.lines.map((l, i) => ({
    productId: l.productId || null,
    orden: i + 1,
    codigo: l.codigo || null,
    descripcion: l.descripcion,
    unidadMedida: l.unidadMedida,
    cantidad: l.cantidad,
    precioUnitario: l.precioUnitario,
    descuento: l.descuento,
    iva: l.iva,
    ivaTipo: l.iva === 0 ? 3 : 1,
    ivaProporcion: 100,
  }));
}

async function persistDraft(
  id: string | null,
  input: InvoiceInput
): Promise<{ id: string } | { errors: Record<string, string> }> {
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] = issue.message;
    return { errors };
  }
  const companyId = await getCompanyId();
  const d = parsed.data;
  const totals = computeInvoiceTotals(
    d.lines.map((l) => ({
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      descuento: l.descuento,
      iva: l.iva,
    })),
    d.moneda
  );
  const data = {
    clientId: d.clientId,
    tipoDocumento: d.tipoDocumento,
    establecimiento: d.establecimiento,
    punto: d.punto,
    issueDate: d.issueDate,
    moneda: d.moneda,
    exchangeRate: d.moneda === "PYG" ? null : d.exchangeRate,
    condicionVenta: d.condicionVenta,
    creditPlazo: d.condicionVenta === 2 ? d.creditPlazo || "30 días" : null,
    creditCuotas: d.condicionVenta === 2 ? (d.creditCuotas ?? null) : null,
    descripcion: d.descripcion || null,
    observacion: d.observacion || null,
    originalInvoiceId: d.originalInvoiceId || null,
    motivoNota: d.motivoNota ?? null,
    totalGravada10: totals.gravada10,
    totalGravada5: totals.gravada5,
    totalExenta: totals.exenta,
    totalIva10: totals.iva10,
    totalIva5: totals.iva5,
    totalIva: totals.totalIva,
    totalDescuento: totals.totalDescuento,
    total: totals.total,
  };

  if (id) {
    const existing = await prisma.invoice.findFirst({ where: { id, companyId } });
    if (!existing) return { errors: { _: "not_found" } };
    if (existing.status !== "DRAFT") return { errors: { _: "not_editable" } };
    await prisma.invoice.update({
      where: { id },
      data: { ...data, lines: { deleteMany: {}, create: lineData(d) } },
    });
    await audit("update", "invoice", id);
    return { id };
  }
  const created = await prisma.invoice.create({
    data: { ...data, companyId, status: "DRAFT", lines: { create: lineData(d) } },
  });
  await audit("create", "invoice", created.id);
  return { id: created.id };
}

export async function saveDraftAction(
  id: string | null,
  input: InvoiceInput
): Promise<ActionResult<{ id: string }>> {
  if (!(await allowed("invoices:write"))) return { ok: false, error: "forbidden" };
  const res = await persistDraft(id, input);
  if ("errors" in res) return { ok: false, error: "validation", errors: res.errors };
  revalidatePath("/invoices");
  return { ok: true, data: { id: res.id } };
}

export async function emitInvoiceAction(
  id: string | null,
  input: InvoiceInput
): Promise<ActionResult<{ id: string }>> {
  if (!(await allowed("invoices:emit"))) return { ok: false, error: "forbidden" };
  const res = await persistDraft(id, input);
  if ("errors" in res) return { ok: false, error: "validation", errors: res.errors };
  try {
    await emitInvoice(res.id);
    await audit("emit", "invoice", res.id);
    // Kick the queue so mock mode feels instant.
    void runPendingJobs().catch(() => undefined);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidatePath("/invoices");
  return { ok: true, data: { id: res.id } };
}

/** Re-send: for REJECTED docs create a corrected draft copy; keeps history. */
export async function duplicateInvoiceAction(
  id: string,
  opts?: { asCreditNote?: boolean }
): Promise<ActionResult<{ id: string }>> {
  if (!(await allowed("invoices:write"))) return { ok: false, error: "forbidden" };
  const companyId = await getCompanyId();
  const original = await prisma.invoice.findFirst({
    where: { id, companyId },
    include: { lines: true },
  });
  if (!original) return { ok: false, error: "not_found" };

  const asNC = opts?.asCreditNote === true;
  const created = await prisma.invoice.create({
    data: {
      companyId,
      clientId: original.clientId,
      tipoDocumento: asNC ? 5 : original.tipoDocumento,
      status: "DRAFT",
      establecimiento: original.establecimiento,
      punto: original.punto,
      issueDate: new Date(),
      moneda: original.moneda,
      exchangeRate: original.exchangeRate,
      condicionVenta: original.condicionVenta,
      creditPlazo: original.creditPlazo,
      creditCuotas: original.creditCuotas,
      descripcion: original.descripcion,
      observacion: original.observacion,
      originalInvoiceId: asNC ? original.id : original.originalInvoiceId,
      motivoNota: asNC ? 1 : original.motivoNota,
      totalGravada10: original.totalGravada10,
      totalGravada5: original.totalGravada5,
      totalExenta: original.totalExenta,
      totalIva10: original.totalIva10,
      totalIva5: original.totalIva5,
      totalIva: original.totalIva,
      totalDescuento: original.totalDescuento,
      total: original.total,
      lines: {
        create: original.lines.map((l) => ({
          productId: l.productId,
          orden: l.orden,
          codigo: l.codigo,
          descripcion: l.descripcion,
          unidadMedida: l.unidadMedida,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          descuento: l.descuento,
          iva: l.iva,
          ivaTipo: l.ivaTipo,
          ivaProporcion: l.ivaProporcion,
        })),
      },
    },
  });
  await audit(asNC ? "create_credit_note" : "duplicate", "invoice", created.id, {
    from: id,
  });
  revalidatePath("/invoices");
  return { ok: true, data: { id: created.id } };
}

export async function cancelInvoiceAction(
  id: string,
  reason: string
): Promise<ActionResult> {
  if (!(await allowed("invoices:emit"))) return { ok: false, error: "forbidden" };
  if (!reason || reason.trim().length < 5) {
    return { ok: false, error: "reason_required" };
  }
  try {
    await cancelInvoice(id, reason.trim());
    await audit("cancel", "invoice", id, { reason });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true };
}

export async function retrySendAction(id: string): Promise<ActionResult> {
  if (!(await allowed("invoices:emit"))) return { ok: false, error: "forbidden" };
  const companyId = await getCompanyId();
  const invoice = await prisma.invoice.findFirst({ where: { id, companyId } });
  if (!invoice) return { ok: false, error: "not_found" };
  if (!["QUEUED", "SENT", "CONTINGENCY"].includes(invoice.status)) {
    return { ok: false, error: "not_retryable" };
  }
  await enqueueJob("send_dte", { invoiceId: id });
  void runPendingJobs().catch(() => undefined);
  revalidatePath(`/invoices/${id}`);
  return { ok: true };
}

export async function canCancelInvoice(id: string): Promise<boolean> {
  const companyId = await getCompanyId();
  const invoice = await prisma.invoice.findFirst({ where: { id, companyId } });
  if (!invoice || invoice.status !== "APPROVED") return false;
  return cancelWindowOpen(invoice);
}

export async function sendInvoiceEmailAction(
  id: string,
  to: string
): Promise<ActionResult> {
  if (!(await allowed("invoices:write"))) return { ok: false, error: "forbidden" };
  if (!smtpConfigured()) return { ok: false, error: "no_smtp" };
  const companyId = await getCompanyId();
  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId },
    include: { client: true },
  });
  if (!invoice) return { ok: false, error: "not_found" };
  const company = await prisma.company.findFirst();
  const attachments: { path: string; filename?: string }[] = [];
  if (invoice.kudePath) attachments.push({ path: invoice.kudePath });
  if (invoice.signedXmlPath) attachments.push({ path: invoice.signedXmlPath });
  if (attachments.length === 0) return { ok: false, error: "no_files" };
  try {
    await sendInvoiceEmail({
      to,
      subject: `${company?.razonSocial ?? ""} — Factura electrónica ${invoice.fullNumber ?? ""}`,
      text:
        `Le enviamos su documento electrónico ${invoice.fullNumber ?? ""}.\n` +
        `CDC: ${invoice.cdc ?? "-"}\n\n` +
        `Se adjuntan el KuDE (PDF) y el XML firmado.`,
      attachments,
    });
    await audit("email", "invoice", id, { to });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
