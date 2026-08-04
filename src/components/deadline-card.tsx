import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { formatDate } from "@/lib/i18n";
import { getCompanyId } from "@/lib/company";
import { nextDeadline } from "@/lib/tax/deadline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, ArrowRight } from "lucide-react";

/**
 * "Next IVA filing — N days remaining", from first-party data.
 *
 * Server Component: it fetches its own deadline so both the dashboard and
 * /taxes can drop it in without threading props. Renders nothing when the
 * company's RUC cannot be parsed — better no card than a date we cannot stand
 * behind.
 */
export async function DeadlineCard() {
  const { t, locale } = await getT();
  const companyId = await getCompanyId();
  const deadline = await nextDeadline(companyId);
  if (!deadline) return null;

  const period = `${deadline.year}-${String(deadline.month).padStart(2, "0")}`;
  const days = deadline.daysRemaining;

  const tone = deadline.overdue
    ? "destructive"
    : days <= 3
      ? "warning"
      : days <= 10
        ? "info"
        : "muted";

  const remaining = deadline.overdue
    ? t("taxes.deadline.overdue", { days: Math.abs(days) })
    : days === 0
      ? t("taxes.deadline.dueToday")
      : t("taxes.deadline.daysRemaining", { days });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" />
          {t("taxes.deadline.title")}
        </CardTitle>
        <Badge variant={tone}>{remaining}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">{t("taxes.deadline.period")}</p>
            <p className="text-lg font-semibold tabular-nums">{period}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">{t("taxes.deadline.dueDate")}</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatDate(deadline.dueDate, locale)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {t(`taxes.filingStatus.${deadline.status}`)}
          </span>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/taxes?year=${deadline.year}&month=${deadline.month}`}>
              {t("taxes.deadline.open")} <ArrowRight />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
