import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { getT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SearchBox, Pagination, ExportCsvButton } from "@/components/list-controls";
import { ClientsTable, NewClientButton, type ClientRow } from "./clients-table";
import { Users } from "lucide-react";

const PAGE_SIZE = 25;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { t } = await getT();
  const params = await searchParams;
  const companyId = await getCompanyId();
  const q = params.q?.trim();
  const page = Math.max(1, Number(params.page) || 1);

  const where = {
    companyId,
    ...(q
      ? {
          OR: [
            { razonSocial: { contains: q, mode: "insensitive" as const } },
            { ruc: { contains: q } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [clients, count] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { razonSocial: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { invoices: true } } },
    }),
    prisma.client.count({ where }),
  ]);

  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    docType: c.docType,
    ruc: c.ruc ?? "",
    dv: c.dv ?? "",
    documentoNumero: c.documentoNumero ?? "",
    razonSocial: c.razonSocial,
    nombreFantasia: c.nombreFantasia ?? "",
    email: c.email ?? "",
    telefono: c.telefono ?? "",
    direccion: c.direccion ?? "",
    pais: c.pais,
    paisDescripcion: c.paisDescripcion,
    isTaxpayer: c.isTaxpayer,
    tipoContribuyente: c.tipoContribuyente ?? 1,
    notes: c.notes ?? "",
    invoiceCount: c._count.invoices,
    displayDoc:
      c.docType === "RUC" && c.ruc
        ? `${c.ruc}-${c.dv}`
        : c.docType === "INNOMINADO"
          ? t("clients.INNOMINADO")
          : (c.documentoNumero ?? "—"),
  }));

  return (
    <div>
      <PageHeader title={t("clients.title")} actions={<NewClientButton />} />
      <Suspense>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchBox />
          <div className="ml-auto">
            <ExportCsvButton endpoint="/api/export/clients" />
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={q ? t("common.noResults") : t("clients.empty")}
            ctaLabel={q ? undefined : undefined}
          />
        ) : (
          <>
            <ClientsTable clients={rows} />
            <Pagination page={page} pages={Math.ceil(count / PAGE_SIZE)} />
          </>
        )}
      </Suspense>
    </div>
  );
}
