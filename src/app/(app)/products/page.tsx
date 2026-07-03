import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { getT } from "@/lib/i18n-server";
import { unidadesMedidas } from "@/lib/sifen/catalogs";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SearchBox, Pagination, ExportCsvButton } from "@/components/list-controls";
import { ProductsTable, NewProductButton, type ProductRow } from "./products-table";
import { Package } from "lucide-react";

const PAGE_SIZE = 25;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { t, locale } = await getT();
  const params = await searchParams;
  const companyId = await getCompanyId();
  const q = params.q?.trim();
  const page = Math.max(1, Number(params.page) || 1);

  const where = {
    companyId,
    ...(q
      ? {
          OR: [
            { descripcionEs: { contains: q, mode: "insensitive" as const } },
            { descripcionEn: { contains: q, mode: "insensitive" as const } },
            { codigo: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [products, count] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ active: "desc" }, { codigo: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
  ]);

  const units = unidadesMedidas.map((u) => ({
    codigo: u.codigo,
    representacion: u.representacion,
    descripcion: u.descripcion,
  }));
  const unitLabel = (code: number) => {
    const u = units.find((x) => x.codigo === code);
    return u ? u.representacion : String(code);
  };

  const rows: ProductRow[] = products.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    descripcionEs: p.descripcionEs,
    descripcionEn: p.descripcionEn ?? "",
    unidadMedida: p.unidadMedida,
    precioUnitario: Number(p.precioUnitario),
    moneda: p.moneda as "PYG" | "USD",
    ivaRate: p.ivaRate,
    tipo: p.tipo,
    active: p.active,
    unitLabel: unitLabel(p.unidadMedida),
    // Locale-aware display name falls back to Spanish.
    descripcionDisplay: locale === "en" && p.descripcionEn ? p.descripcionEn : p.descripcionEs,
  })) as ProductRow[];

  return (
    <div>
      <PageHeader title={t("products.title")} actions={<NewProductButton units={units} />} />
      <Suspense>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchBox />
          <div className="ml-auto">
            <ExportCsvButton endpoint="/api/export/products" />
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={Package} title={q ? t("common.noResults") : t("products.empty")} />
        ) : (
          <>
            <ProductsTable products={rows} units={units} />
            <Pagination page={page} pages={Math.ceil(count / PAGE_SIZE)} />
          </>
        )}
      </Suspense>
    </div>
  );
}
