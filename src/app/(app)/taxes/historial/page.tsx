import Link from "next/link";
import { getCompanyId } from "@/lib/company";
import { getT } from "@/lib/i18n-server";
import { formatMoney, formatDate } from "@/lib/i18n";
import { listFilings } from "@/lib/tax/filing";
import type { Form120Data } from "@/lib/form120";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import {
  SearchBox,
  DateRangeFilter,
  StatusFilter,
  Pagination,
  ExportCsvButton,
} from "@/components/list-controls";
import { FilingStatusBadge } from "./filing-status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Archive, FileCheck2 } from "lucide-react";

const PAGE_SIZE = 25;
const FILING_STATUSES = ["DRAFT", "CLOSED", "SUBMITTED", "PAID"];

export default async function FilingHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { t, locale } = await getT();
  const params = await searchParams;
  const companyId = await getCompanyId();

  const { rows, page, pages } = await listFilings(companyId, {
    q: params.q,
    status: params.status,
    from: params.from,
    to: params.to,
    page: Math.max(1, Number(params.page) || 1),
    pageSize: PAGE_SIZE,
  });

  const hasFilters = Boolean(params.q || params.status || params.from || params.to);
  const money = (v: number) => formatMoney(v, "PYG", locale);

  return (
    <div>
      <PageHeader
        title={t("taxes.history.title")}
        actions={
          <Button variant="outline" asChild>
            <Link href="/taxes">{t("taxes.history.backToTaxes")}</Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBox placeholder={t("taxes.history.searchPlaceholder")} />
        <DateRangeFilter />
        <StatusFilter options={FILING_STATUSES} />
        <div className="ml-auto">
          <ExportCsvButton endpoint="/api/export/filings" />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Archive}
          title={hasFilters ? t("common.noResults") : t("taxes.history.emptyTitle")}
        >
          {!hasFilters && <p>{t("taxes.history.emptyDescription")}</p>}
        </EmptyState>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("taxes.history.period")}</TableHead>
                  <TableHead>{t("taxes.history.type")}</TableHead>
                  <TableHead>{t("taxes.history.dueDate")}</TableHead>
                  <TableHead className="text-right">{t("taxes.aPagar")}</TableHead>
                  <TableHead>{t("taxes.history.status")}</TableHead>
                  <TableHead>{t("taxes.history.closedBy")}</TableHead>
                  <TableHead className="text-right">{t("taxes.history.receipt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((f) => {
                  const snapshot = f.snapshot as unknown as Partial<Form120Data> | null;
                  const period =
                    f.month === null
                      ? String(f.year)
                      : `${f.year}-${String(f.month).padStart(2, "0")}`;
                  return (
                    <TableRow key={f.id}>
                      <TableCell>
                        <Link
                          href={`/taxes/historial/${f.id}`}
                          className="font-medium text-primary hover:underline tabular-nums"
                        >
                          {period}
                        </Link>
                      </TableCell>
                      <TableCell>{f.type}</TableCell>
                      <TableCell className="tabular-nums">
                        {formatDate(f.dueDate, locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(snapshot?.aPagar ?? 0)}
                      </TableCell>
                      <TableCell>
                        <FilingStatusBadge status={f.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{f.closedBy ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {f.officialPdfPath ? (
                          <a
                            href={`/api/filings/${f.id}/pdf`}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <FileCheck2 className="h-4 w-4" />
                            {t("taxes.history.viewReceipt")}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} pages={pages} />
        </>
      )}
    </div>
  );
}
