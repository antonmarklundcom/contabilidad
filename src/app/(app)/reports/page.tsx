import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { getT } from "@/lib/i18n-server";
import { formatMoney } from "@/lib/i18n";
import { monthlyTrend } from "@/lib/accounting";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendChart,
  IncomeByClientChart,
  ExpensesByCategoryChart,
} from "./reports-charts";

export default async function ReportsPage() {
  const { t, locale } = await getT();
  const companyId = await getCompanyId();
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const trend = await monthlyTrend(companyId, 12);

  // Income by client (approved invoices, this year).
  const invoices = await prisma.invoice.findMany({
    where: { companyId, status: "APPROVED", issueDate: { gte: yearStart } },
    include: { client: { select: { razonSocial: true } } },
  });
  const byClient = new Map<string, number>();
  for (const inv of invoices) {
    byClient.set(
      inv.client.razonSocial,
      (byClient.get(inv.client.razonSocial) ?? 0) + Number(inv.total)
    );
  }
  const incomeByClient = [...byClient.entries()]
    .map(([name, value]) => ({ name: name.length > 22 ? name.slice(0, 20) + "…" : name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Expenses by category (confirmed, this year).
  const expenses = await prisma.expense.findMany({
    where: { companyId, status: "CONFIRMED", fecha: { gte: yearStart } },
    include: { category: true },
  });
  const byCategory = new Map<string, number>();
  for (const e of expenses) {
    const name = e.category
      ? locale === "en"
        ? e.category.nameEn
        : e.category.nameEs
      : t("reports.uncategorized");
    byCategory.set(name, (byCategory.get(name) ?? 0) + Number(e.total));
  }
  const expensesByCategory = [...byCategory.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Year summary.
  const totalIncome = trend.reduce((s, m) => s + m.income, 0);
  const totalExpenses = trend.reduce((s, m) => s + m.expenses, 0);
  const money = (v: number) => formatMoney(v, "PYG", locale);

  return (
    <div>
      <PageHeader title={t("reports.title")} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">{t("reports.income")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600">
              {money(totalIncome)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">{t("reports.expenses")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-red-600">
              {money(totalExpenses)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">{t("reports.result")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {money(totalIncome - totalExpenses)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6">
        <TrendChart data={trend} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <IncomeByClientChart data={incomeByClient} />
        <ExpensesByCategoryChart data={expensesByCategory} />
      </div>
    </div>
  );
}
