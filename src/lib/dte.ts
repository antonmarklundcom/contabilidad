/**
 * DTE lifecycle: emit (number → XML → sign → QR → KuDE → queue send),
 * send to SIFEN (from the job runner), cancel (evento within 48h).
 */
import fs from "fs";
import { prisma } from "@/lib/prisma";
import { getSifenAdapterForCompany, buildInvoiceData } from "@/lib/sifen";
import { logSifen } from "@/lib/sifen/log";
import { randomSecurityCode } from "@/lib/sifen/cdc";
import { extractCdc } from "@/lib/sifen/mock-adapter";
import { nextDocumentNumber } from "@/lib/sequences";
import { saveFile } from "@/lib/storage";
import { generateKudePdf } from "@/lib/kude";
import { enqueueJob } from "@/lib/jobs/queue";
import type { InvoiceWithRelations } from "@/lib/sifen/mapping";

const CANCEL_WINDOW_HOURS = 48;

async function loadInvoice(invoiceId: string): Promise<InvoiceWithRelations> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { lines: true, client: true, originalInvoice: true },
  });
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
  return invoice;
}

/**
 * Emits a draft: assigns the sequential number, generates + signs the XML,
 * produces QR + KuDE, and queues the SIFEN send job.
 */
export async function emitInvoice(invoiceId: string): Promise<InvoiceWithRelations> {
  const { adapter, company, config } = await getSifenAdapterForCompany();
  let invoice = await loadInvoice(invoiceId);
  if (invoice.status !== "DRAFT" && invoice.status !== "REJECTED") {
    throw new Error(`Invoice ${invoiceId} is not a draft (status ${invoice.status})`);
  }
  if (invoice.lines.length === 0) throw new Error("Invoice has no lines");

  // Reserve the sequential number (atomic increment — race-safe).
  if (!invoice.numero) {
    const point = await prisma.expeditionPoint.findFirst({
      where: {
        companyId: company.id,
        codigo: invoice.punto,
        establishment: { codigo: invoice.establecimiento },
      },
    });
    if (!point) throw new Error("Expedition point not found");
    const numero = await nextDocumentNumber(point.id, invoice.tipoDocumento);
    invoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        numero,
        fullNumber: `${invoice.establecimiento}-${invoice.punto}-${numero}`,
        securityCode: randomSecurityCode(),
        emittedAt: new Date(),
      },
      include: { lines: true, client: true, originalInvoice: true },
    });
  }

  // Generate the XML with the real library (validates the whole document).
  const data = buildInvoiceData(invoice);
  let xml: string;
  try {
    xml = await adapter.generateXml(data, config);
  } catch (err) {
    await logSifen({
      operation: "generateXml",
      mode: adapter.mode,
      companyId: company.id,
      invoiceId,
      success: false,
      detail: String(err),
    });
    throw err;
  }

  const signedXml = await adapter.signXml(xml);
  const cdc = extractCdc(signedXml);

  const base = `${invoice.tipoDocumento}-${invoice.fullNumber}`;
  const xmlPath = await saveFile("xml", `${base}.xml`, xml);
  const signedXmlPath = await saveFile("xml", `${base}-signed.xml`, signedXml);

  // QR + KuDE are generated at emission so the document is printable even in
  // contingency. QR failures (e.g. missing CSC in test mode) don't block.
  let qrText: string | null = null;
  try {
    qrText = await adapter.generateQr(signedXml);
  } catch (err) {
    await logSifen({
      operation: "generateQr",
      mode: adapter.mode,
      companyId: company.id,
      invoiceId,
      success: false,
      detail: String(err),
    });
  }

  invoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: "QUEUED",
      cdc,
      qrText,
      xmlPath,
      signedXmlPath,
      sifenEstado: null,
      sifenCodigoRespuesta: null,
      sifenMensaje: null,
    },
    include: { lines: true, client: true, originalInvoice: true },
  });

  const kudeBuffer = await generateKudePdf(invoice, company, qrText, adapter.mode);
  const kudePath = await saveFile("kude", `${base}.pdf`, kudeBuffer);
  invoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { kudePath },
    include: { lines: true, client: true, originalInvoice: true },
  });

  await logSifen({
    operation: "generateXml",
    mode: adapter.mode,
    companyId: company.id,
    invoiceId,
    requestXml: xml,
    success: true,
  });

  await enqueueJob("send_dte", { invoiceId });
  return invoice;
}

/** Job handler: send the signed XML to SIFEN and process the verdict. */
export async function sendInvoiceToSifen(invoiceId: string): Promise<void> {
  const { adapter, company } = await getSifenAdapterForCompany();
  const invoice = await loadInvoice(invoiceId);
  if (!["QUEUED", "SENT", "CONTINGENCY"].includes(invoice.status)) return;
  if (!invoice.signedXmlPath) throw new Error("Invoice has no signed XML");

  const signedXml = await fs.promises.readFile(invoice.signedXmlPath, "utf8");
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "SENT", sentAt: invoice.sentAt ?? new Date() },
  });

  let response;
  try {
    response = await adapter.send(signedXml);
  } catch (err) {
    // SIFEN unreachable → contingency; the job retries with backoff.
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "CONTINGENCY", contingencyAt: invoice.contingencyAt ?? new Date() },
    });
    await logSifen({
      operation: "send",
      mode: adapter.mode,
      companyId: company.id,
      invoiceId,
      requestXml: signedXml,
      success: false,
      detail: `network/transport error: ${String(err)}`,
    });
    throw err;
  }

  await logSifen({
    operation: "send",
    mode: adapter.mode,
    companyId: company.id,
    invoiceId,
    requestXml: signedXml,
    responseXml: response.raw,
    success: response.success,
    detail: `${response.code ?? ""} ${response.message ?? ""}`.trim(),
  });

  if (response.estado === "Aprobado") {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        sifenEstado: response.estado,
        sifenCodigoRespuesta: response.code,
        sifenMensaje: response.message,
        sifenProtocolo: response.protocol,
        cdc: response.cdc ?? invoice.cdc,
      },
    });
  } else if (response.estado === "Rechazado") {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        sifenEstado: response.estado,
        sifenCodigoRespuesta: response.code,
        sifenMensaje: response.message,
      },
    });
  } else {
    // Pendiente/Desconocido → check again later.
    await enqueueJob("query_status", { invoiceId }, { delaySeconds: 120 });
  }
}

/** Job handler: poll SIFEN for the status of a sent document. */
export async function queryInvoiceStatus(invoiceId: string): Promise<void> {
  const { adapter, company } = await getSifenAdapterForCompany();
  const invoice = await loadInvoice(invoiceId);
  if (!invoice.cdc) return;
  const status = await adapter.queryStatus(invoice.cdc);
  await logSifen({
    operation: "queryStatus",
    mode: adapter.mode,
    companyId: company.id,
    invoiceId,
    responseXml: status.raw,
    success: status.estado === "Aprobado",
    detail: `${status.code ?? ""} ${status.message ?? ""}`.trim(),
  });
  if (status.estado === "Aprobado" && invoice.status !== "APPROVED") {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        sifenEstado: status.estado,
        sifenCodigoRespuesta: status.code,
        sifenMensaje: status.message,
      },
    });
  } else if (status.estado === "Rechazado" && invoice.status !== "REJECTED") {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        sifenEstado: status.estado,
        sifenCodigoRespuesta: status.code,
        sifenMensaje: status.message,
      },
    });
  }
}

export function cancelWindowOpen(invoice: { approvedAt: Date | null; emittedAt: Date | null }): boolean {
  const ref = invoice.approvedAt ?? invoice.emittedAt;
  if (!ref) return false;
  return Date.now() - ref.getTime() < CANCEL_WINDOW_HOURS * 3600 * 1000;
}

/** Cancels an approved document in SIFEN (evento de cancelación). */
export async function cancelInvoice(invoiceId: string, reason: string): Promise<void> {
  const { adapter, company } = await getSifenAdapterForCompany();
  const invoice = await loadInvoice(invoiceId);
  if (invoice.status !== "APPROVED") throw new Error("Only approved documents can be cancelled");
  if (!invoice.cdc) throw new Error("Invoice has no CDC");
  if (!cancelWindowOpen(invoice)) {
    throw new Error("SIFEN's 48-hour cancellation window has passed");
  }

  const response = await adapter.cancelDocument(invoice.cdc, reason);
  await logSifen({
    operation: "cancel",
    mode: adapter.mode,
    companyId: company.id,
    invoiceId,
    responseXml: response.raw,
    success: response.success,
    detail: `${response.code ?? ""} ${response.message ?? ""}`.trim(),
  });
  if (!response.success) {
    throw new Error(`SIFEN rejected the cancellation: ${response.code ?? ""} ${response.message ?? ""}`);
  }
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
  });
}

/** Regenerates the KuDE PDF (e.g. after approval to refresh QR/status). */
export async function regenerateKude(invoiceId: string): Promise<string> {
  const { adapter, company } = await getSifenAdapterForCompany();
  const invoice = await loadInvoice(invoiceId);
  const base = `${invoice.tipoDocumento}-${invoice.fullNumber ?? invoice.id}`;
  const kudeBuffer = await generateKudePdf(invoice, company, invoice.qrText, adapter.mode);
  const kudePath = await saveFile("kude", `${base}.pdf`, kudeBuffer);
  await prisma.invoice.update({ where: { id: invoiceId }, data: { kudePath } });
  return kudePath;
}
