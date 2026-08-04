import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { getT } from "@/lib/i18n-server";
import { formatMoney, formatDate, formatDateTime } from "@/lib/i18n";
import type { Form120Data } from "@/lib/form120";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FilingStatusBadge } from "../filing-status-badge";
import { FilingActions } from "./filing-actions";
import { Info, Download } from "lucide-react";

export default async function FilingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t, locale } = await getT();
  const { id } = await params;
  const companyId = await getCompanyId();

  const filing = await prisma.taxFiling.findFirst({ where: { id, companyId } });
  if (!filing) notFound();

  const s = filing.snapshot as unknown as Form120Data;
  const money = (v: number) => formatMoney(v ?? 0, "PYG", locale);
  const period =
    filing.month === null
      ? String(filing.year)
      : `${filing.year}-${String(filing.month).padStart(2, "0")}`;

  const Row = ({ label, value, bold }: { label: string; value: number; bold?: boolean }) => (
    <div className={`flex justify-between py-1 text-sm ${bold ? "font-semibold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{money(value)}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t("taxes.history.detailTitle")} ${period}`}
        actions={
          <div className="flex items-center gap-2">
            <FilingStatusBadge status={filing.status} />
            <Button variant="outline" asChild>
              <Link href="/taxes/historial">{t("taxes.history.backToHistory")}</Link>
            </Button>
          </div>
        }
      />

      <Alert variant="info">
        <Info />
        <AlertDescription>{t("taxes.history.snapshotHint")}</AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("taxes.history.timeline")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("taxes.history.dueDate")}</span>
              <span className="tabular-nums">{formatDate(filing.dueDate, locale)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("taxes.history.closedAt")}</span>
              <span className="tabular-nums">
                {filing.closedAt ? formatDateTime(filing.closedAt, locale) : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("taxes.history.closedBy")}</span>
              <span>{filing.closedBy ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("taxes.history.submittedAt")}</span>
              <span className="tabular-nums">
                {filing.submittedAt ? formatDateTime(filing.submittedAt, locale) : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("taxes.history.paidAt")}</span>
              <span className="tabular-nums">
                {filing.paidAt ? formatDateTime(filing.paidAt, locale) : "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("taxes.ventasSection")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Row label={t("books.gravada10")} value={s?.ventas?.gravada10 ?? 0} />
            <Row label={t("books.iva10")} value={s?.ventas?.debito10 ?? 0} />
            <Row label={t("books.gravada5")} value={s?.ventas?.gravada5 ?? 0} />
            <Row label={t("books.iva5")} value={s?.ventas?.debito5 ?? 0} />
            <Row label={t("books.exentas")} value={s?.ventas?.exentas ?? 0} />
            <div className="mt-1 border-t pt-1">
              <Row label={t("taxes.debitoFiscal")} value={s?.ventas?.debitoFiscal ?? 0} bold />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("taxes.comprasSection")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Row label={t("books.gravada10")} value={s?.compras?.gravada10 ?? 0} />
            <Row
              label={`${t("books.iva10")} → ${t("books.ivaDeducible")}`}
              value={s?.compras?.credito10 ?? 0}
            />
            <Row label={t("books.gravada5")} value={s?.compras?.gravada5 ?? 0} />
            <Row
              label={`${t("books.iva5")} → ${t("books.ivaDeducible")}`}
              value={s?.compras?.credito5 ?? 0}
            />
            <Row label={t("taxes.ivaNoDeducible")} value={s?.compras?.ivaNoDeducible ?? 0} />
            <div className="mt-1 border-t pt-1">
              <Row label={t("taxes.creditoFiscal")} value={s?.compras?.creditoFiscal ?? 0} bold />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("taxes.form120")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md">
            <Row label={t("taxes.debitoFiscal")} value={s?.ventas?.debitoFiscal ?? 0} />
            <Row label={`(−) ${t("taxes.creditoFiscal")}`} value={-(s?.compras?.creditoFiscal ?? 0)} />
            <Row label={`(−) ${t("taxes.saldoAnterior")}`} value={-(s?.saldoAnterior ?? 0)} />
            <div className="mt-1 border-t pt-1">
              {(s?.aPagar ?? 0) > 0 ? (
                <Row label={t("taxes.aPagar")} value={s.aPagar} bold />
              ) : (
                <Row label={t("taxes.saldoAFavor")} value={s?.saldoAFavor ?? 0} bold />
              )}
            </div>
          </div>

          {filing.month !== null && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <a href={`/api/export/form120?year=${filing.year}&month=${filing.month}`}>
                  <Download /> {t("taxes.downloadForm120")}
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={`/api/export/tax-report?year=${filing.year}&month=${filing.month}`}>
                  <Download /> {t("taxes.downloadReport")}
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <FilingActions
        filingId={filing.id}
        status={filing.status}
        hasReceipt={Boolean(filing.officialPdfPath)}
        notes={filing.notes ?? ""}
      />
    </div>
  );
}
