"use server";

import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { computeInvoiceTotals } from "@/lib/money";
import { emitInvoice } from "@/lib/dte";
import { runPendingJobs } from "@/lib/jobs/runner";
import { attachInvoiceToLink, claimLink } from "@/lib/invoice-link";
import { invoiceLinkRedeemSchema, type InvoiceLinkRedeemInput } from "@/lib/validators";
import type { InvoiceLink } from "@prisma/client";

/**
 * Redeeming a one-time invoice link (PLAN Phase 8.1).
 *
 * The ONE server action reachable without a session, so it is written as if
 * everything reaching it is hostile:
 *
 *  - the token is re-verified here; the page having rendered proves nothing,
 *    because a server action is a POST endpoint anyone can call directly;
 *  - the company, document type, expedition point and currency come off the
 *    stored link, never off the payload — the caller cannot pick whose
 *    invoice this is;
 *  - the link is CLAIMED before anything is emitted, so a double submit
 *    cannot produce two DTEs;
 *  - no capability check, because there is no session to check one against.
 *    The token IS the capability, and it was minted by someone who had
 *    `invoices:emit`.
 */

export type RedeemError =
  | "not_found"
  | "expired"
  | "redeemed"
  | "validation"
  | "emit_failed";

export type RedeemResult =
  | { ok: true; invoiceId: string }
  | { ok: false; error: RedeemError; errors?: Record<string, string> };

/**
 * Finds the buyer among the company's clients, or records a new one.
 *
 * Matching is by document within the company, which is the same key the rest
 * of the app treats as a client's identity. A repeat customer redeeming a
 * second link does not become a second client row; an unbounded number of new
 * ones is impossible because a link redeems once.
 */
async function resolveClient(
  link: InvoiceLink,
  input: InvoiceLinkRedeemInput
): Promise<string> {
  const existing =
    input.docType === "RUC" && input.ruc
      ? await prisma.client.findFirst({
          where: { companyId: link.companyId, docType: "RUC", ruc: input.ruc },
        })
      : input.docType === "CI" && input.documentoNumero
        ? await prisma.client.findFirst({
            where: {
              companyId: link.companyId,
              docType: "CI",
              documentoNumero: input.documentoNumero,
            },
          })
        : null;

  if (existing) {
    // An email the buyer just gave us is worth keeping; their name is not
    // worth overwriting the operator's own record with.
    if (input.email && !existing.email) {
      await prisma.client.update({ where: { id: existing.id }, data: { email: input.email } });
    }
    return existing.id;
  }

  const created = await prisma.client.create({
    data: {
      companyId: link.companyId,
      docType: input.docType,
      ruc: input.docType === "RUC" ? (input.ruc || null) : null,
      dv: input.docType === "RUC" ? (input.dv || null) : null,
      documentoNumero: input.docType === "CI" ? (input.documentoNumero || null) : null,
      razonSocial: input.razonSocial,
      email: input.email || null,
      isTaxpayer: input.docType === "RUC",
    },
  });
  return created.id;
}

export async function redeemInvoiceLinkAction(
  token: string,
  input: unknown
): Promise<RedeemResult> {
  const parsed = invoiceLinkRedeemSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] = issue.message;
    return { ok: false, error: "validation", errors };
  }
  const d = parsed.data;

  // PYG has no decimals — enforced here as well as in the UI, because the UI
  // is not a boundary (see money.ts and the same rule in invoiceSchema).
  if (
    d.lines.some(
      (l) => !Number.isInteger(l.precioUnitario) || !Number.isInteger(l.descuento)
    )
  ) {
    return {
      ok: false,
      error: "validation",
      errors: { "lines.0.precioUnitario": "pyg_no_decimals" },
    };
  }

  // Claim BEFORE emitting: a burned link that produced nothing is a nuisance,
  // two DTEs from one link would be a fiscal problem.
  const claim = await claimLink(token);
  if (!claim.ok) return { ok: false, error: claim.reason };
  const link = claim.link;

  try {
    const clientId = await resolveClient(link, d);
    const totals = computeInvoiceTotals(
      d.lines.map((l) => ({
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        descuento: l.descuento,
        iva: l.iva,
      })),
      link.moneda
    );

    const invoice = await prisma.invoice.create({
      data: {
        companyId: link.companyId,
        clientId,
        tipoDocumento: link.tipoDocumento,
        status: "DRAFT",
        establecimiento: link.establecimiento,
        punto: link.punto,
        issueDate: new Date(),
        moneda: link.moneda,
        condicionVenta: d.condicionVenta,
        creditPlazo: d.condicionVenta === 2 ? "30 días" : null,
        observacion: link.note,
        totalGravada10: totals.gravada10,
        totalGravada5: totals.gravada5,
        totalExenta: totals.exenta,
        totalIva10: totals.iva10,
        totalIva5: totals.iva5,
        totalIva: totals.totalIva,
        totalDescuento: totals.totalDescuento,
        total: totals.total,
        lines: {
          create: d.lines.map((l, i) => ({
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
          })),
        },
      },
    });

    // The link now owns a document even if the emission below fails, so the
    // operator can find whatever the redemption produced.
    await attachInvoiceToLink(link.id, invoice.id);

    await emitInvoice(invoice.id);
    await audit("emit", "invoice", invoice.id, {
      via: "invoice_link",
      linkId: link.id,
      createdBy: link.createdBy,
    });
    // Kick the queue so mock mode feels instant, exactly as the logged-in
    // emit action does.
    void runPendingJobs().catch(() => undefined);
    return { ok: true, invoiceId: invoice.id };
  } catch (err) {
    await audit("emit_failed", "invoiceLink", link.id, { detail: String(err) });
    return { ok: false, error: "emit_failed" };
  }
}
