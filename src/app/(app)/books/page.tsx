import { Suspense } from "react";
import { getCompanyId } from "@/lib/company";
import { getT } from "@/lib/i18n-server";
import { libroVentas, libroCompras } from "@/lib/accounting";
import { PageHeader } from "@/components/page-header";
import { MonthPicker } from "@/components/month-picker";
import { LibroTable } from "./libro-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { t } = await getT();
  const params = await searchParams;
  const companyId = await getCompanyId();
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;

  const [ventas, compras] = await Promise.all([
    libroVentas(companyId, year, month),
    libroCompras(companyId, year, month),
  ]);

  const exportHref = (book: "ventas" | "compras", format: "csv" | "xlsx") =>
    `/api/export/libro?book=${book}&format=${format}&year=${year}&month=${month}`;

  return (
    <div>
      <PageHeader title={t("books.title")} actions={<MonthPicker year={year} month={month} />} />
      <Alert variant="info" className="mb-4">
        <Info />
        <AlertDescription>{t("books.onlyApproved")}</AlertDescription>
      </Alert>

      <Suspense>
        <Tabs defaultValue="ventas">
          <TabsList>
            <TabsTrigger value="ventas">{t("books.sales")}</TabsTrigger>
            <TabsTrigger value="compras">{t("books.purchases")}</TabsTrigger>
          </TabsList>

          <TabsContent value="ventas" className="space-y-3">
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={exportHref("ventas", "csv")}>
                  <Download /> {t("common.exportCsv")}
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={exportHref("ventas", "xlsx")}>
                  <Download /> {t("common.exportXlsx")}
                </a>
              </Button>
            </div>
            <LibroTable rows={ventas.rows} totals={ventas.totals} />
          </TabsContent>

          <TabsContent value="compras" className="space-y-3">
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={exportHref("compras", "csv")}>
                  <Download /> {t("common.exportCsv")}
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={exportHref("compras", "xlsx")}>
                  <Download /> {t("common.exportXlsx")}
                </a>
              </Button>
            </div>
            <LibroTable rows={compras.rows} totals={compras.totals} showDeducible />
          </TabsContent>
        </Tabs>
      </Suspense>
    </div>
  );
}
