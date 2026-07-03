import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { buildInvoiceWhere } from "@/lib/invoice-query";
import { getT } from "@/lib/i18n-server";
import { formatMoney, formatDate } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import {
  SearchBox,
  DateRangeFilter,
  StatusFilter,
  Pagination,
  ExportCsvButton,
} from "@/components/list-controls";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText } from "lucide-react";

const PAGE_SIZE = 25;
const STATUSES = [
  "DRAFT",
  "QUEUED",
  "SENT",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "CONTINGENCY",
];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { t, locale } = await getT();
  const params = await searchParams;
  const companyId = await getCompanyId();
  const page = Math.max(1, Number(params.page) || 1);
  const where = buildInvoiceWhere(companyId, params);

  const [invoices, count] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { client: { select: { razonSocial: true } } },
    }),
    prisma.invoice.count({ where }),
  ]);

  const hasFilters = Boolean(params.q || params.status || params.from || params.to);

  return (
    <div>
      <PageHeader
        title={t("invoices.title")}
        actions={
          <Button asChild>
            <Link href="/invoices/new">{t("invoices.new")}</Link>
          </Button>
        }
      />
      <Suspense>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchBox />
          <StatusFilter options={STATUSES} />
          <DateRangeFilter />
          <div className="ml-auto">
            <ExportCsvButton endpoint="/api/export/invoices" />
          </div>
        </div>

        {invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={hasFilters ? t("common.noResults") : t("invoices.empty")}
            ctaLabel={hasFilters ? undefined : t("invoices.emptyCta")}
            ctaHref={hasFilters ? undefined : "/invoices/new"}
          />
        ) : (
          <>
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("invoices.number")}</TableHead>
                    <TableHead>{t("invoices.type")}</TableHead>
                    <TableHead>{t("invoices.client")}</TableHead>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="text-right">{t("common.total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {inv.fullNumber ?? `(${t("status.DRAFT").toLowerCase()})`}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {t(`invoices.type_${inv.tipoDocumento}`)}
                      </TableCell>
                      <TableCell>{inv.client.razonSocial}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(inv.issueDate, locale)}
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
            </div>
            <Pagination page={page} pages={Math.ceil(count / PAGE_SIZE)} />
          </>
        )}
      </Suspense>
    </div>
  );
}
