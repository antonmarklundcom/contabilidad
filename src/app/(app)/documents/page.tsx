import { Suspense } from "react";
import { getCompanyId } from "@/lib/company";
import { getT } from "@/lib/i18n-server";
import { formatDate } from "@/lib/i18n";
import { listDocuments, DOCUMENT_KINDS } from "@/lib/documents";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import {
  SearchBox,
  DateRangeFilter,
  StatusFilter,
  Pagination,
  ExportCsvButton,
} from "@/components/list-controls";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FolderOpen, Download } from "lucide-react";
import { UploadDocumentForm } from "./upload-document-form";

const PAGE_SIZE = 25;

/** Human size, in the same spirit as the backups list in Settings. */
function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { t, locale } = await getT();
  const params = await searchParams;
  const companyId = await getCompanyId();

  const { rows, count, page, pages } = await listDocuments(companyId, {
    q: params.q,
    kind: params.status,
    from: params.from,
    to: params.to,
    page: Number(params.page) || 1,
    pageSize: PAGE_SIZE,
  });

  const hasFilters = Boolean(params.q || params.status || params.from || params.to);

  return (
    <div>
      <PageHeader title={t("documents.title")} actions={<UploadDocumentForm />} />

      <Suspense>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchBox placeholder={t("documents.searchPlaceholder")} />
          <StatusFilter options={[...DOCUMENT_KINDS]} />
          <DateRangeFilter />
          <div className="ml-auto">
            <ExportCsvButton endpoint="/api/export/documents" />
          </div>
        </div>

        {count === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title={hasFilters ? t("common.noResults") : t("documents.emptyTitle")}
          >
            {!hasFilters && (
              <p className="text-sm text-muted-foreground">{t("documents.emptyDescription")}</p>
            )}
          </EmptyState>
        ) : (
          <>
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("documents.documentTitle")}</TableHead>
                    <TableHead>{t("documents.kind")}</TableHead>
                    <TableHead>{t("documents.uploadedBy")}</TableHead>
                    <TableHead className="text-right">{t("documents.size")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="text-muted-foreground">
                        {formatDate(doc.receivedAt, locale)}
                      </TableCell>
                      <TableCell>
                        <a
                          href={`/api/documents/${doc.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                        >
                          <Download className="size-3.5" />
                          {doc.title}
                        </a>
                        {doc.notes && (
                          <p className="text-xs text-muted-foreground">{doc.notes}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {t(`status.${doc.kind}`)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {doc.uploadedBy ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fileSize(doc.sizeBytes)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} pages={pages} />
          </>
        )}
      </Suspense>
    </div>
  );
}
