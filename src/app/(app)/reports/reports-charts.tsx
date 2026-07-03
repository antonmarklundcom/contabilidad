"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useI18n } from "@/components/i18n-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { monthName } from "@/lib/i18n";

// Chart palette — one accent + semantic series, calm and legible.
const COLORS = ["#4f46e5", "#059669", "#d97706", "#dc2626", "#0891b2", "#7c3aed", "#65a30d"];

interface TrendPoint {
  year: number;
  month: number;
  income: number;
  expenses: number;
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const { t, locale, money } = useI18n();
  const chartData = data.map((d) => ({
    label: monthName(d.month, locale).slice(0, 3),
    [t("reports.income")]: d.income,
    [t("reports.expenses")]: d.expenses,
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reports.monthlyTrend")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" fontSize={12} />
            <YAxis
              fontSize={11}
              width={70}
              tickFormatter={(v) => new Intl.NumberFormat(locale === "es" ? "es-PY" : "en-US", { notation: "compact" }).format(v)}
            />
            <Tooltip formatter={(v) => money(Number(v))} />
            <Legend />
            <Line
              type="monotone"
              dataKey={t("reports.income")}
              stroke={COLORS[1]}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey={t("reports.expenses")}
              stroke={COLORS[3]}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function IncomeByClientChart({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  const { t, locale, money } = useI18n();
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("reports.incomeByClient")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">{t("reports.noData")}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reports.incomeByClient")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
            <XAxis
              type="number"
              fontSize={11}
              tickFormatter={(v) => new Intl.NumberFormat(locale === "es" ? "es-PY" : "en-US", { notation: "compact" }).format(v)}
            />
            <YAxis type="category" dataKey="name" width={140} fontSize={11} />
            <Tooltip formatter={(v) => money(Number(v))} />
            <Bar dataKey="value" fill={COLORS[0]} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function ExpensesByCategoryChart({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  const { t, money } = useI18n();
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("reports.expensesByCategory")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">{t("reports.noData")}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reports.expensesByCategory")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" outerRadius={100} label={false}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => money(Number(v))} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
