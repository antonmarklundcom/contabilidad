import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import type { Locale } from "@/lib/i18n";
import type { CategoryOption } from "./expense-form";

export async function loadCategories(locale: Locale): Promise<CategoryOption[]> {
  const companyId = await getCompanyId();
  const cats = await prisma.expenseCategory.findMany({
    where: { companyId },
    orderBy: { nameEs: "asc" },
  });
  return cats.map((c) => ({ id: c.id, label: locale === "en" ? c.nameEn : c.nameEs }));
}
