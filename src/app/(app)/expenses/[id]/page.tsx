import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { getT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/page-header";
import { ExpenseForm } from "../expense-form";
import { loadCategories } from "../category-options";

export default async function ExpenseReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t, locale } = await getT();
  const { id } = await params;
  const companyId = await getCompanyId();
  const expense = await prisma.expense.findFirst({ where: { id, companyId } });
  if (!expense) notFound();

  const categories = await loadCategories(locale);
  const confidences = (expense.confidence as Record<string, number> | null) ?? null;

  return (
    <div>
      <PageHeader
        title={t("expenses.reviewTitle")}
        description={expense.supplierRazonSocial ?? undefined}
      />
      <ExpenseForm
        initial={{
          id: expense.id,
          supplierRuc: expense.supplierRuc ?? "",
          supplierDv: expense.supplierDv ?? "",
          supplierRazonSocial: expense.supplierRazonSocial ?? "",
          timbrado: expense.timbrado ?? "",
          tipoComprobante: expense.tipoComprobante ?? "",
          numeroComprobante: expense.numeroComprobante ?? "",
          fecha: expense.fecha ?? undefined,
          gravada10: Number(expense.gravada10),
          gravada5: Number(expense.gravada5),
          exenta: Number(expense.exenta),
          iva10: Number(expense.iva10),
          iva5: Number(expense.iva5),
          total: Number(expense.total),
          moneda: expense.moneda as "PYG" | "USD",
          categoryId: expense.categoryId ?? "",
          notes: expense.notes ?? "",
        }}
        categories={categories}
        confidences={confidences}
        fileUrl={expense.filePath ? `/api/expenses/${expense.id}/file` : null}
        fileMime={expense.fileMime}
      />
    </div>
  );
}
