import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { getT } from "@/lib/i18n-server";
import { formatMoney, formatDate } from "@/lib/i18n";
import { getSifenMode } from "@/lib/sifen";
import { dashboardData } from "@/lib/accounting";
import { PageHeader } from "@/components/page-header";
import { DeadlineCard } from "@/components/deadline-card";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  Scale,
  AlertTriangle,
  FileText,
  Receipt,
  ArrowRight,
} from "lucide-react";

export default async function DashboardPage() {
  const { t, locale } = await getT();
  const companyId = await getCompanyId();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [data, company, latestInvoices, latestExpenses] = await Promise.all([
    dashboardData(companyId, year, month),
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.invoice.findMany({
      where: { companyId, status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { client: { select: { razonSocial: true } } },
    }),
    prisma.expense.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const money = (v: number) => formatMoney(v, "PYG", locale);

  // Certificate / timbrado / queue warnings (60/30/7 days for the cert).
  const warnings: { variant: "warning" | "destructive" | "info"; text: string }[] = [];
  const mode = getSifenMode();
  if (mode === "mock") {
    warnings.push({ variant: "info", text: t("dashboard.noCert") });
  }
  if (company?.certExpiresAt) {
    const days = Math.ceil((company.certExpiresAt.getTime() - now.getTime()) / 86400000);
    if (days < 0) warnings.push({ variant: "destructive", text: t("dashboard.certExpired") });
    else if (days <= 60)
      warnings.push({ variant: "warning", text: t("dashboard.certExpiresIn", { days }) });
  }
  if (data.contingencyCount > 0) {
    warnings.push({
      variant: "warning",
      text: t("dashboard.contingencyPending", { count: data.contingencyCount }),
    });
  }
  if (data.queuedCount > 0) {
    warnings.push({
      variant: "info",
      text: t("dashboard.queuePending", { count: data.queuedCount }),
    });
  }

  const stats = [
    {
      label: t("dashboard.incomeThisMonth"),
      value: money(data.incomeThisMonth),
      icon: TrendingUp,
      color: "text-emerald-600",
    },
    {
      label: t("dashboard.expensesThisMonth"),
      value: money(data.expensesThisMonth),
      icon: TrendingDown,
      color: "text-red-600",
    },
    {
      label: data.ivaPosition >= 0 ? t("dashboard.ivaToPay") : t("dashboard.ivaInFavor"),
      value: money(Math.abs(data.ivaPosition)),
      icon: Scale,
      color: data.ivaPosition >= 0 ? "text-amber-600" : "text-emerald-600",
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("dashboard.title")}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/expenses/upload">{t("dashboard.uploadReceipt")}</Link>
            </Button>
            <Button asChild>
              <Link href="/invoices/new">{t("dashboard.newInvoice")}</Link>
            </Button>
          </div>
        }
      />

      {warnings.length > 0 && (
        <div className="mb-6 space-y-2">
          {warnings.map((w, i) => (
            <Alert key={i} variant={w.variant}>
              <AlertTriangle />
              <AlertDescription>{w.text}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center justify-between pt-5">
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
              </div>
              <s.icon className={`h-8 w-8 ${s.color}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-6">
        <DeadlineCard />
      </div>

      <div className="mb-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.ivaPosition")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">{t("dashboard.ivaDebit")}</p>
              <p className="text-lg font-medium tabular-nums">{money(data.ivaDebito)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("dashboard.ivaCredit")}</p>
              <p className="text-lg font-medium tabular-nums">{money(data.ivaCredito)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {data.ivaPosition >= 0 ? t("dashboard.ivaToPay") : t("dashboard.ivaInFavor")}
              </p>
              <p
                className={`text-lg font-semibold tabular-nums ${data.ivaPosition >= 0 ? "text-amber-600" : "text-emerald-600"}`}
              >
                {money(Math.abs(data.ivaPosition))}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> {t("dashboard.latestInvoices")}
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/invoices">
                {t("dashboard.viewAll")} <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {latestInvoices.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">{t("invoices.empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("invoices.number")}</TableHead>
                    <TableHead>{t("invoices.client")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="text-right">{t("common.total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latestInvoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <Link href={`/invoices/${inv.id}`} className="text-primary hover:underline">
                          {inv.fullNumber ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[10rem] truncate">
                        {inv.client.razonSocial}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(Number(inv.total), inv.moneda, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4" /> {t("dashboard.latestExpenses")}
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/expenses">
                {t("dashboard.viewAll")} <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {latestExpenses.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">{t("expenses.empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("expenses.supplier")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="text-right">{t("common.total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latestExpenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-muted-foreground">
                        {formatDate(e.fecha, locale)}
                      </TableCell>
                      <TableCell className="max-w-[10rem] truncate">
                        <Link href={`/expenses/${e.id}`} className="text-primary hover:underline">
                          {e.supplierRazonSocial || e.supplierRuc || "—"}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={e.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(Number(e.total), e.moneda, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
