import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { getT } from "@/lib/i18n-server";
import { formatMoney, formatDate, formatDateTime } from "@/lib/i18n";
import type { Form120Data } from "@/lib/form120";
import type { IrpData } from "@/lib/irp";
import { periodLabel, isAnnualPeriod } from "@/lib/tax/filing-period";
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

  // The snapshot's shape follows the filing's type. Casting every snapshot to
  // Form120Data would render an IRP return as a wall of zeros — the figures
  // simply are not in there.
  const isIva = filing.type === "IVA";
  const s = isIva ? (filing.snapshot as unknown as Form120Data) : null;
  const irp = isIva ? null : (filing.snapshot as unknown as IrpData);
  const money = (v: number) => formatMoney(v ?? 0, "PYG", locale);
  const percent = (v: number) =>
    `${new Intl.NumberFormat(locale === "en" ? "en-US" : "es-PY", {
      maximumFractionDigits: 1,
    }).format((v ?? 0) * 100)}%`;
  const period = periodLabel(filing.year, filing.month);

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

        {s && (
        <>
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
        </>
        )}

        {irp && (
        <>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("taxes.irp.ingresosSection")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Row label={t("taxes.irp.gravado10")} value={irp?.ingresos?.gravado10 ?? 0} />
            <Row label={t("taxes.irp.gravado5")} value={irp?.ingresos?.gravado5 ?? 0} />
            <Row label={t("taxes.irp.exentas")} value={irp?.ingresos?.exentas ?? 0} />
            <Row label={t("taxes.irp.ivaFacturado")} value={irp?.ingresos?.ivaFacturado ?? 0} />
            <div className="mt-1 border-t pt-1">
              <Row label={t("taxes.irp.rentaBruta")} value={irp?.ingresos?.rentaBruta ?? 0} bold />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("taxes.irp.egresosSection")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Row
              label={t("taxes.irp.egresoDeducible10", {
                pct: percent(irp?.egresos?.fraccionDeducible10 ?? 1),
              })}
              value={irp?.egresos?.deducible10 ?? 0}
            />
            <Row
              label={t("taxes.irp.egresoDeducible5", {
                pct: percent(irp?.egresos?.fraccionDeducible5 ?? 1),
              })}
              value={irp?.egresos?.deducible5 ?? 0}
            />
            <Row label={t("taxes.irp.egresoExentas")} value={irp?.egresos?.deducibleExentas ?? 0} />
            <Row
              label={t("taxes.irp.egresoNoDeducible")}
              value={irp?.egresos?.egresoNoDeducible ?? 0}
            />
            <div className="mt-1 border-t pt-1">
              <Row
                label={t("taxes.irp.egresoDeducible")}
                value={irp?.egresos?.egresoDeducible ?? 0}
                bold
              />
            </div>
          </CardContent>
        </Card>
        </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {s ? t("taxes.form120") : t("taxes.irp.liquidacion")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {s && (
            <div className="max-w-md">
              <Row label={t("taxes.debitoFiscal")} value={s.ventas?.debitoFiscal ?? 0} />
              <Row
                label={`(−) ${t("taxes.creditoFiscal")}`}
                value={-(s.compras?.creditoFiscal ?? 0)}
              />
              <Row label={`(−) ${t("taxes.saldoAnterior")}`} value={-(s.saldoAnterior ?? 0)} />
              <div className="mt-1 border-t pt-1">
                {(s.aPagar ?? 0) > 0 ? (
                  <Row label={t("taxes.aPagar")} value={s.aPagar} bold />
                ) : (
                  <Row label={t("taxes.saldoAFavor")} value={s.saldoAFavor ?? 0} bold />
                )}
              </div>
            </div>
          )}

          {irp && (
            <div className="max-w-xl space-y-3">
              <div className="flex justify-between gap-4 py-1 text-sm">
                <span className="text-muted-foreground">{t("taxes.irp.regime")}</span>
                <span className="font-medium">
                  {t(irp.regime === "RGC" ? "taxes.irp.regimeRGC" : "taxes.irp.regimeRSP")}
                </span>
              </div>
              <div>
                <Row label={t("taxes.irp.rentaBruta")} value={irp.ingresos?.rentaBruta ?? 0} />
                <Row
                  label={`(−) ${t("taxes.irp.egresoDeducible")}`}
                  value={-(irp.rules?.deductsExpenses ? (irp.egresos?.egresoDeducible ?? 0) : 0)}
                />
                <div className="mt-1 border-t pt-1">
                  <Row
                    label={t("taxes.irp.rentaNetaImponible")}
                    value={irp.rentaNetaImponible ?? 0}
                    bold
                  />
                </div>
              </div>

              {irp.noIncidido ? (
                <Alert variant="info">
                  <Info />
                  <AlertDescription>
                    {t("taxes.irp.noIncidido", {
                      threshold: money(irp.rules?.incidenceThreshold ?? 0),
                    })}
                  </AlertDescription>
                </Alert>
              ) : (
                (irp.bracketBreakdown ?? []).length > 0 && (
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium">{t("taxes.irp.brackets")}</h3>
                    {irp.bracketBreakdown.map((slice) => (
                      <Row
                        key={`${slice.from}-${slice.rate}`}
                        label={t("taxes.irp.bracketRow", {
                          from: money(slice.from),
                          to: slice.to === null ? t("taxes.irp.bracketOpen") : money(slice.to),
                          rate: percent(slice.rate),
                          base: money(slice.base),
                        })}
                        value={slice.tax}
                      />
                    ))}
                  </div>
                )
              )}

              <div className="border-t pt-1">
                <Row label={t("taxes.irp.impuesto")} value={irp.impuesto ?? 0} bold />
              </div>
            </div>
          )}

          {irp && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <a href={`/api/export/irp?year=${filing.year}`}>
                  <Download /> {t("taxes.irp.downloadPdf")}
                </a>
              </Button>
            </div>
          )}

          {s && !isAnnualPeriod(filing.month) && (
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
