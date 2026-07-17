import { getT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/page-header";
import { ExpenseForm } from "../expense-form";
import { loadCategories } from "../category-options";

export default async function NewExpensePage() {
  const { t, locale } = await getT();
  const categories = await loadCategories(locale);
  return (
    <div>
      <PageHeader title={t("expenses.new")} />
      <ExpenseForm
        initial={{
          supplierRuc: "",
          supplierDv: "",
          supplierRazonSocial: "",
          timbrado: "",
          tipoComprobante: "FACTURA",
          numeroComprobante: "",
          fecha: new Date(),
          gravada10: 0,
          gravada5: 0,
          exenta: 0,
          iva10: 0,
          iva5: 0,
          total: 0,
          moneda: "PYG",
          deduciblePercent: 100,
          items: [],
          categoryId: "",
          notes: "",
        }}
        categories={categories}
      />
    </div>
  );
}
