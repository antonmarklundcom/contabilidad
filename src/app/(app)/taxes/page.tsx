import Link from "next/link";
import { getCompanyId } from "@/lib/company";
import { getT } from "@/lib/i18n-server";
import { buildForm120, getPeriodClose } from "@/lib/form120";
import { buildReconciliation } from "@/lib/reconcile";
import { PageHeader } from "@/components/page-header";
import { MonthPicker } from "@/components/month-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/status-badge";
import { Info, Download, AlertTriangle, CheckCircle2 } from "lucide-react";
import { SaldoAnteriorForm } from "./saldo-anterior-form";
import { ClosePeriodForm } from "./close-period-form";

function money(v: number) {
  return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.round(v));
}

export default async function TaxesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { t } = await getT();
  const params = await searchParams;
  const companyId = await getCompanyId();
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;

  const [data, reconciliation, close] = await Promise.all([
    buildForm120(companyId, year, month),
    buildReconciliation(companyId, year, month),
    getPeriodClose(companyId, year, month),
  ]);

  const Row = ({ label, value, bold }: { label: string; value: number; bold?: boolean }) => (
    <div className={`flex justify-between py-1 text-sm ${bold ? "font-semibold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{money(value)}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("taxes.title")} actions={<MonthPicker year={year} month={month} />} />

      <Alert variant="info">
        <Info />
        <AlertDescription>{t("taxes.form120Hint")}</AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("taxes.ventasSection")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Row label={t("books.gravada10")} value={data.ventas.gravada10} />
            <Row label={t("books.iva10")} value={data.ventas.debito10} />
            <Row label={t("books.gravada5")} value={data.ventas.gravada5} />
            <Row label={t("books.iva5")} value={data.ventas.debito5} />
            <Row label={t("books.exentas")} value={data.ventas.exentas} />
            <div className="mt-1 border-t pt-1">
              <Row label={t("taxes.debitoFiscal")} value={data.ventas.debitoFiscal} bold />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("taxes.comprasSection")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Row label={t("books.gravada10")} value={data.compras.gravada10} />
            <Row label={`${t("books.iva10")} → ${t("books.ivaDeducible")}`} value={data.compras.credito10} />
            <Row label={t("books.gravada5")} value={data.compras.gravada5} />
            <Row label={`${t("books.iva5")} → ${t("books.ivaDeducible")}`} value={data.compras.credito5} />
            <Row label={t("taxes.ivaNoDeducible")} value={data.compras.ivaNoDeducible} />
            <div className="mt-1 border-t pt-1">
              <Row label={t("taxes.creditoFiscal")} value={data.compras.creditoFiscal} bold />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("taxes.form120")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SaldoAnteriorForm year={year} month={month} value={data.saldoAnterior} />
          <div className="max-w-md">
            <Row label={t("taxes.debitoFiscal")} value={data.ventas.debitoFiscal} />
            <Row label={`(−) ${t("taxes.creditoFiscal")}`} value={-data.compras.creditoFiscal} />
            <Row label={`(−) ${t("taxes.saldoAnterior")}`} value={-data.saldoAnterior} />
            <div className="mt-1 border-t pt-1">
              {data.aPagar > 0 ? (
                <Row label={t("taxes.aPagar")} value={data.aPagar} bold />
              ) : (
                <Row label={t("taxes.saldoAFavor")} value={data.saldoAFavor} bold />
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("taxes.documentCounts", {
              ventas: data.documentCounts.ventas,
              compras: data.documentCounts.compras,
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={`/api/export/form120?year=${year}&month=${month}`}>
                <Download /> {t("taxes.downloadForm120")}
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`/api/export/tax-report?year=${year}&month=${month}`}>
                <Download /> {t("taxes.downloadReport")}
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("taxes.reconciliation")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {reconciliation.clean ? (
            <Alert variant="success">
              <CheckCircle2 />
              <AlertDescription>{t("taxes.reconciliationClean")}</AlertDescription>
            </Alert>
          ) : (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertDescription>{t("taxes.reconciliationDirty")}</AlertDescription>
            </Alert>
          )}

          {reconciliation.unresolvedInvoices.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("taxes.unresolvedInvoices")}</h3>
              <div className="divide-y rounded-md border text-sm">
                {reconciliation.unresolvedInvoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <Link href={`/invoices/${inv.id}`} className="text-primary hover:underline">
                      {inv.fullNumber ?? inv.id.slice(0, 8)}
                    </Link>
                    <span className="text-muted-foreground">{inv.clientName}</span>
                    <StatusBadge status={inv.status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {reconciliation.unresolvedExpenses.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("taxes.unresolvedExpenses")}</h3>
              <div className="divide-y rounded-md border text-sm">
                {reconciliation.unresolvedExpenses.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <Link href={`/expenses/${e.id}`} className="text-primary hover:underline">
                      {e.numeroComprobante ?? e.id.slice(0, 8)}
                    </Link>
                    <span className="text-muted-foreground">{e.supplierRazonSocial ?? "—"}</span>
                    <span>{t(`taxes.reason.${e.reason}`)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t pt-4">
            <ClosePeriodForm
              year={year}
              month={month}
              clean={reconciliation.clean}
              closedBy={close?.closedBy ?? null}
              closedAt={close?.closedAt ?? null}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
