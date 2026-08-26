import Link from "next/link";
import { getCompanyId } from "@/lib/company";
import { getT } from "@/lib/i18n-server";
import { buildIrp, getIrpRegime, isIrpRegime, IRP_REGIMES, type IrpRegime } from "@/lib/irp";
import { buildAnnualReconciliation } from "@/lib/reconcile";
import { getAnnualClose, getAnnualFiling, irpDueDateForCompany } from "@/lib/tax/filing";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/status-badge";
import { Info, Download, AlertTriangle, CheckCircle2, Archive, CalendarDays } from "lucide-react";
import { IrpRegimeForm } from "./irp-regime-form";
import { CloseYearForm } from "./close-year-form";
import { YearPicker } from "./year-picker";

function money(v: number) {
  return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.round(v));
}

function percent(v: number) {
  return `${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 }).format(v * 100)}%`;
}

/**
 * The annual IRP return (PLAN Phase 7.2) — `/taxes` one rung up the calendar.
 *
 * Deliberately the same page: year picker, rubro tables, discrepancy list,
 * close + sign-off, PDF. The only genuinely new control is the regime, which
 * exists because PLAN Phase 7.4 said to confirm the regime rather than assume
 * it and the roadmap never answered which one.
 *
 * When the year is closed the page renders the DECLARED snapshot instead of a
 * live recomputation — same rule as the monthly close: a signed-off figure is
 * what was signed off.
 */
export default async function AnnualTaxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { t } = await getT();
  const params = await searchParams;
  const companyId = await getCompanyId();

  // Default to last year: the current fiscal year is not filable yet.
  const year = Number(params.year) || new Date().getFullYear() - 1;

  const storedRegime = await getIrpRegime(companyId);
  const previewed = params.regime;
  const regime: IrpRegime = isIrpRegime(previewed) ? previewed : (storedRegime ?? "RSP");

  const [live, reconciliation, close, filing, dueDate] = await Promise.all([
    buildIrp(companyId, year, regime),
    buildAnnualReconciliation(companyId, year),
    getAnnualClose(companyId, year),
    getAnnualFiling(companyId, year),
    irpDueDateForCompany(companyId, year),
  ]);

  // A closed year shows what was declared, not what the books say today.
  const data = close?.snapshot ?? live;
  const rules = IRP_REGIMES[data.regime] ?? IRP_REGIMES[regime];
  const isStub = rules.status === "stub";
  const closable = storedRegime !== null && IRP_REGIMES[storedRegime]?.status === "ready";

  const draftPreparedAt = filing && filing.status === "DRAFT" ? filing.createdAt : null;

  const Row = ({ label, value, bold }: { label: string; value: number; bold?: boolean }) => (
    <div className={`flex justify-between gap-4 py-1 text-sm ${bold ? "font-semibold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums whitespace-nowrap">{money(value)}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("taxes.irp.title")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/taxes">{t("taxes.irp.openMonthly")}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/taxes/historial">
                <Archive /> {t("taxes.history.title")}
              </Link>
            </Button>
            <YearPicker year={year} />
          </div>
        }
      />

      <Alert variant="info">
        <Info />
        <AlertDescription>{t("taxes.irp.hint")}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("taxes.irp.fiscalYear")} {year}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4" />
            {t("taxes.irp.dueDate", { date: dueDate.toISOString().slice(0, 10) })}
          </p>
          <IrpRegimeForm selected={regime} stored={storedRegime} />
          {isStub && (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertDescription>{t("taxes.irp.regimeStub")}</AlertDescription>
            </Alert>
          )}
          <Alert variant="warning">
            <AlertTriangle />
            <AlertDescription>{t("taxes.irp.ratesUnverified")}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("taxes.irp.ingresosSection")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Row label={t("taxes.irp.gravado10")} value={data.ingresos.gravado10} />
            <Row label={t("taxes.irp.gravado5")} value={data.ingresos.gravado5} />
            <Row label={t("taxes.irp.exentas")} value={data.ingresos.exentas} />
            <Row label={t("taxes.irp.ivaFacturado")} value={data.ingresos.ivaFacturado} />
            <Row label={t("taxes.irp.totalFacturado")} value={data.ingresos.totalFacturado} />
            <div className="mt-1 border-t pt-1">
              <Row label={t("taxes.irp.rentaBruta")} value={data.ingresos.rentaBruta} bold />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("taxes.irp.egresosSection")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <Row
                label={t("taxes.irp.egresoDeducible10", {
                  pct: percent(data.egresos.fraccionDeducible10),
                })}
                value={data.egresos.deducible10}
              />
              <Row
                label={t("taxes.irp.egresoDeducible5", {
                  pct: percent(data.egresos.fraccionDeducible5),
                })}
                value={data.egresos.deducible5}
              />
              <Row label={t("taxes.irp.egresoExentas")} value={data.egresos.deducibleExentas} />
              <Row
                label={t("taxes.irp.egresoNoDeducible")}
                value={data.egresos.egresoNoDeducible}
              />
              <Row label={t("taxes.irp.ivaNoDeducible")} value={data.egresos.ivaNoDeducible} />
              <div className="mt-1 border-t pt-1">
                <Row
                  label={t("taxes.irp.egresoDeducible")}
                  value={data.egresos.egresoDeducible}
                  bold
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("taxes.irp.deducibilityProxy")}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("taxes.irp.liquidacion")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xl">
            <Row label={t("taxes.irp.rentaBruta")} value={data.ingresos.rentaBruta} />
            {rules.deductsExpenses ? (
              <Row
                label={`(−) ${t("taxes.irp.egresoDeducible")}`}
                value={-data.egresos.egresoDeducible}
              />
            ) : (
              <Row label={`(−) ${t("taxes.irp.noRegimeDeduction")}`} value={0} />
            )}
            <div className="mt-1 border-t pt-1">
              <Row
                label={t("taxes.irp.rentaNetaImponible")}
                value={data.rentaNetaImponible}
                bold
              />
            </div>
          </div>

          {data.noIncidido ? (
            <Alert variant="info">
              <Info />
              <AlertDescription>
                {t("taxes.irp.noIncidido", {
                  threshold: money(rules.incidenceThreshold ?? 0),
                })}
              </AlertDescription>
            </Alert>
          ) : (
            data.bracketBreakdown.length > 0 && (
              <div className="max-w-xl space-y-1">
                <h3 className="text-sm font-medium">{t("taxes.irp.brackets")}</h3>
                {data.bracketBreakdown.map((slice) => (
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

          <div className="max-w-xl border-t pt-1">
            <Row label={t("taxes.irp.impuesto")} value={data.impuesto} bold />
          </div>

          <p className="text-xs text-muted-foreground">
            {t("taxes.irp.documentCounts", {
              ventas: data.documentCounts.ventas,
              compras: data.documentCounts.compras,
              meses: data.mesesConMovimiento.length,
            })}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={`/api/export/irp?year=${year}&regime=${regime}`}>
                <Download /> {t("taxes.irp.downloadPdf")}
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("taxes.irp.reconciliation")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {reconciliation.clean ? (
            <Alert variant="success">
              <CheckCircle2 />
              <AlertDescription>{t("taxes.irp.reconciliationClean")}</AlertDescription>
            </Alert>
          ) : (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertDescription>{t("taxes.irp.reconciliationDirty")}</AlertDescription>
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

          {reconciliation.sequenceGaps.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("taxes.sequenceGaps")}</h3>
              <p className="text-xs text-muted-foreground">{t("taxes.sequenceGapsHint")}</p>
              <div className="divide-y rounded-md border text-sm">
                {reconciliation.sequenceGaps.map((gap) => (
                  <div
                    key={`${gap.establecimiento}-${gap.punto}-${gap.tipoDocumento}-${gap.from}`}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="tabular-nums">
                      {gap.establecimiento}-{gap.punto}-{String(gap.from).padStart(7, "0")}
                      {gap.count > 1 ? ` → ${String(gap.to).padStart(7, "0")}` : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {t("taxes.sequenceGapCount", { count: gap.count })}
                    </span>
                    <span className="text-muted-foreground">
                      {gap.trailing
                        ? t("taxes.sequenceGapReserved")
                        : t("taxes.sequenceGapMissing")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t pt-4">
            {draftPreparedAt && (
              <p className="mb-3 text-xs text-muted-foreground">
                {t("taxes.draftPrepared", {
                  date: draftPreparedAt.toISOString().slice(0, 10),
                })}
              </p>
            )}
            <CloseYearForm
              year={year}
              clean={reconciliation.clean}
              closable={closable}
              closedBy={close?.closedBy ?? null}
              closedAt={close?.closedAt ?? null}
              status={close?.status ?? null}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
