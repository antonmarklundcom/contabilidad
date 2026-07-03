import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getCompanyId } from "@/lib/company";
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
import { Receipt } from "lucide-react";

const PAGE_SIZE = 25;

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { t, locale } = await getT();
  const params = await searchParams;
  const companyId = await getCompanyId();
  const page = Math.max(1, Number(params.page) || 1);
  const q = params.q?.trim();

  const where: Prisma.ExpenseWhereInput = {
    companyId,
    ...(params.status ? { status: params.status as never } : {}),
    ...(params.from || params.to
      ? {
          fecha: {
            ...(params.from ? { gte: new Date(params.from) } : {}),
            ...(params.to ? { lte: new Date(`${params.to}T23:59:59`) } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { supplierRazonSocial: { contains: q, mode: "insensitive" } },
            { supplierRuc: { contains: q } },
            { numeroComprobante: { contains: q } },
          ],
        }
      : {}),
  };

  const [expenses, count] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { category: true },
    }),
    prisma.expense.count({ where }),
  ]);

  const hasFilters = Boolean(params.q || params.status || params.from || params.to);

  return (
    <div>
      <PageHeader
        title={t("expenses.title")}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/expenses/new">{t("expenses.manual")}</Link>
            </Button>
            <Button asChild>
              <Link href="/expenses/upload">{t("expenses.upload")}</Link>
            </Button>
          </div>
        }
      />
      <Suspense>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchBox />
          <StatusFilter options={["NEEDS_REVIEW", "CONFIRMED"]} />
          <DateRangeFilter />
          <div className="ml-auto">
            <ExportCsvButton endpoint="/api/export/expenses" />
          </div>
        </div>

        {expenses.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={hasFilters ? t("common.noResults") : t("expenses.empty")}
            ctaLabel={hasFilters ? undefined : t("expenses.emptyCta")}
            ctaHref={hasFilters ? undefined : "/expenses/upload"}
          />
        ) : (
          <>
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("expenses.supplier")}</TableHead>
                    <TableHead>{t("books.comprobante")}</TableHead>
                    <TableHead>{t("expenses.category")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="text-right">{t("common.total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-muted-foreground">
                        {formatDate(e.fecha, locale)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/expenses/${e.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {e.supplierRazonSocial || e.supplierRuc || "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.numeroComprobante || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.category ? (locale === "en" ? e.category.nameEn : e.category.nameEs) : "—"}
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
            </div>
            <Pagination page={page} pages={Math.ceil(count / PAGE_SIZE)} />
          </>
        )}
      </Suspense>
    </div>
  );
}
