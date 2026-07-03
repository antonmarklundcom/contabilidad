import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { getT } from "@/lib/i18n-server";
import { formatMoney, formatDate, formatDateTime } from "@/lib/i18n";
import { explainSifenCode } from "@/lib/sifen/errors";
import { cancelWindowOpen } from "@/lib/dte";
import { getSifenMode } from "@/lib/sifen";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceActions } from "./invoice-actions";
import { AlertTriangle, CircleAlert } from "lucide-react";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t, locale } = await getT();
  const { id } = await params;
  const companyId = await getCompanyId();
  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId },
    include: {
      lines: { orderBy: { orden: "asc" } },
      client: true,
      originalInvoice: { select: { id: true, fullNumber: true } },
      notas: { select: { id: true, fullNumber: true, tipoDocumento: true, status: true } },
    },
  });
  if (!invoice) notFound();

  const mode = getSifenMode();
  const explanation = explainSifenCode(invoice.sifenCodigoRespuesta);
  const money = (v: unknown) => formatMoney(Number(v), invoice.moneda, locale);
  const canCancel = invoice.status === "APPROVED" && cancelWindowOpen(invoice);

  const timeline: { key: string; at: Date | null }[] = [
    { key: "createdEvent", at: invoice.createdAt },
    { key: "emittedEvent", at: invoice.emittedAt },
    { key: "sentEvent", at: invoice.sentAt },
    ...(invoice.contingencyAt ? [{ key: "contingencyEvent", at: invoice.contingencyAt }] : []),
    ...(invoice.approvedAt ? [{ key: "approvedEvent", at: invoice.approvedAt }] : []),
    ...(invoice.rejectedAt ? [{ key: "rejectedEvent", at: invoice.rejectedAt }] : []),
    ...(invoice.cancelledAt ? [{ key: "cancelledEvent", at: invoice.cancelledAt }] : []),
  ].filter((e) => e.at);

  return (
    <div>
      <PageHeader
        title={`${t(`invoices.type_${invoice.tipoDocumento}`)} ${invoice.fullNumber ?? ""}`}
        description={`${invoice.client.razonSocial} · ${formatDate(invoice.issueDate, locale)}`}
        actions={
          <InvoiceActions
            invoiceId={invoice.id}
            status={invoice.status}
            fullNumber={invoice.fullNumber}
            clientEmail={invoice.client.email}
            clientPhone={invoice.client.telefono}
            hasKude={Boolean(invoice.kudePath)}
            hasXml={Boolean(invoice.signedXmlPath)}
            canCancel={canCancel}
            total={money(invoice.total)}
            companyMode={mode}
          />
        }
      />

      {invoice.status === "REJECTED" && (
        <Alert variant="destructive" className="mb-4">
          <CircleAlert />
          <AlertTitle>{t("invoices.rejectedBanner")}</AlertTitle>
          <AlertDescription>
            <p className="font-medium">
              {t("invoices.sifenCode")}: {invoice.sifenCodigoRespuesta} — {invoice.sifenMensaje}
            </p>
            {explanation && (
              <p className="mt-1">
                {t("invoices.sifenExplanation")}:{" "}
                {locale === "en" ? explanation.en : explanation.es}
              </p>
            )}
            {explanation?.fixEs && (
              <p className="mt-1 text-sm">
                {t("invoices.suggestedFix")}:{" "}
                {locale === "en" ? explanation.fixEn : explanation.fixEs}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {invoice.status === "CONTINGENCY" && (
        <Alert variant="warning" className="mb-4">
          <AlertTriangle />
          <AlertTitle>{t("status.CONTINGENCY")}</AlertTitle>
          <AlertDescription>{t("invoices.contingencyBanner")}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Lines */}
          <Card>
            <CardHeader>
              <CardTitle>{t("invoices.lines")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("products.code")}</TableHead>
                    <TableHead>{t("invoices.description")}</TableHead>
                    <TableHead className="text-right">{t("invoices.qty")}</TableHead>
                    <TableHead className="text-right">{t("invoices.unitPrice")}</TableHead>
                    <TableHead className="text-right">{t("invoices.ivaRate")}</TableHead>
                    <TableHead className="text-right">{t("invoices.lineTotal")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.lines.map((line) => {
                    const qty = Number(line.cantidad);
                    const subtotal = qty * (Number(line.precioUnitario) - Number(line.descuento));
                    return (
                      <TableRow key={line.id}>
                        <TableCell className="font-mono text-xs">{line.codigo ?? "—"}</TableCell>
                        <TableCell>{line.descripcion}</TableCell>
                        <TableCell className="text-right tabular-nums">{qty}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(line.precioUnitario)}
                        </TableCell>
                        <TableCell className="text-right">
                          {line.iva === 0 ? t("products.exenta") : `${line.iva}%`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{money(subtotal)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
                {[
                  ["invoices.gravada10", invoice.totalGravada10],
                  ["invoices.gravada5", invoice.totalGravada5],
                  ["invoices.exenta", invoice.totalExenta],
                  ["invoices.iva10", invoice.totalIva10],
                  ["invoices.iva5", invoice.totalIva5],
                  ["invoices.totalIva", invoice.totalIva],
                ].map(([key, value]) => (
                  <div key={key as string} className="flex justify-between">
                    <span className="text-muted-foreground">{t(key as string)}</span>
                    <span className="tabular-nums">{money(value)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-1 text-base font-semibold">
                  <span>{t("invoices.grandTotal")}</span>
                  <span className="tabular-nums">{money(invoice.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KuDE preview */}
          <Card>
            <CardHeader>
              <CardTitle>{t("invoices.kudePreview")}</CardTitle>
            </CardHeader>
            <CardContent>
              {invoice.kudePath ? (
                <iframe
                  src={`/api/invoices/${invoice.id}/kude?inline=1`}
                  className="h-[560px] w-full rounded-md border"
                  title="KuDE"
                />
              ) : (
                <p className="text-sm text-muted-foreground">{t("invoices.noKudeYet")}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("common.status")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("common.status")}</span>
                <StatusBadge status={invoice.status} />
              </div>
              {invoice.cdc && (
                <div>
                  <p className="text-muted-foreground">{t("invoices.cdc")}</p>
                  <p className="break-all font-mono text-xs">{invoice.cdc}</p>
                </div>
              )}
              {invoice.sifenProtocolo && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("invoices.protocol")}</span>
                  <span className="font-mono text-xs">{invoice.sifenProtocolo}</span>
                </div>
              )}
              {invoice.sifenCodigoRespuesta && invoice.status !== "REJECTED" && (
                <div>
                  <p className="text-muted-foreground">{t("invoices.sifenResponse")}</p>
                  <p className="text-xs">
                    {invoice.sifenCodigoRespuesta} — {invoice.sifenMensaje}
                  </p>
                </div>
              )}
              {invoice.cancelReason && (
                <div>
                  <p className="text-muted-foreground">{t("invoices.cancelReason")}</p>
                  <p className="text-xs">{invoice.cancelReason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("invoices.statusTimeline")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l pl-4">
                {timeline.map((e, i) => (
                  <li key={i} className="text-sm">
                    <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                    <p className="font-medium">{t(`invoices.${e.key}`)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(e.at, locale)}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {(invoice.originalInvoice || invoice.notas.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {invoice.originalInvoice
                    ? t("invoices.originalDoc")
                    : t("invoices.relatedNotes")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {invoice.originalInvoice && (
                  <Link
                    href={`/invoices/${invoice.originalInvoice.id}`}
                    className="text-primary hover:underline"
                  >
                    {invoice.originalInvoice.fullNumber}
                  </Link>
                )}
                {invoice.notas.map((n) => (
                  <div key={n.id} className="flex items-center justify-between">
                    <Link href={`/invoices/${n.id}`} className="text-primary hover:underline">
                      {t(`invoices.type_${n.tipoDocumento}`)} {n.fullNumber ?? ""}
                    </Link>
                    <StatusBadge status={n.status} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
