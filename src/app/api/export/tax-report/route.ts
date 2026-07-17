import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { buildForm120 } from "@/lib/form120";
import { libroVentas, libroCompras } from "@/lib/accounting";
import { computeDeducible } from "@/lib/deductibility";
import {
  generateMonthlyReportPdf,
  type CategoryBreakdownRow,
} from "@/lib/tax-report";
import { getSifenMode } from "@/lib/sifen";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const companyId = await getCompanyId();
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const month = Number(url.searchParams.get("month")) || new Date().getMonth() + 1;

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  const [company, form120, ventas, compras, expenses, pendingReviewCount] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    buildForm120(companyId, year, month),
    libroVentas(companyId, year, month),
    libroCompras(companyId, year, month),
    prisma.expense.findMany({
      where: { companyId, status: "CONFIRMED", fecha: { gte: start, lte: end } },
      include: { category: true, items: true },
    }),
    prisma.expense.count({ where: { companyId, status: "NEEDS_REVIEW" } }),
  ]);

  const byCategory = new Map<string, CategoryBreakdownRow>();
  for (const e of expenses) {
    const name = e.category?.nameEs ?? "Sin categoría";
    const row = byCategory.get(name) ?? { name, total: 0, ivaDeducible: 0, count: 0 };
    const deducible = computeDeducible({
      iva10: Number(e.iva10),
      iva5: Number(e.iva5),
      deduciblePercent: e.deduciblePercent,
      moneda: e.moneda,
      items: e.items.map((item) => ({
        total: Number(item.total),
        tasa: item.tasa,
        deduciblePercent: item.deduciblePercent,
      })),
    });
    row.total += Number(e.total);
    row.ivaDeducible += deducible.ivaDeducible;
    row.count += 1;
    byCategory.set(name, row);
  }
  const categories = [...byCategory.values()].sort((a, b) => b.total - a.total);

  const pdf = await generateMonthlyReportPdf(
    company,
    {
      form120,
      ventasTotals: ventas.totals,
      comprasTotals: compras.totals,
      categories,
      pendingReviewCount,
    },
    getSifenMode()
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="informe-mensual-${year}-${String(month).padStart(2, "0")}.pdf"`,
    },
  });
}
