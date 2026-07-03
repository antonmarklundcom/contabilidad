import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getCompanyId } from "@/lib/company";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const companyId = await getCompanyId();
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries());
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
  };
  const expenses = await prisma.expense.findMany({
    where,
    orderBy: { fecha: "asc" },
    include: { category: true },
    take: 10000,
  });
  const csv = toCsv(
    [
      "fecha", "proveedor", "ruc", "timbrado", "tipo", "numero", "categoria",
      "moneda", "gravada10", "gravada5", "exenta", "iva10", "iva5", "total", "estado",
    ],
    expenses.map((e) => [
      e.fecha ? e.fecha.toISOString().slice(0, 10) : "",
      e.supplierRazonSocial ?? "",
      e.supplierRuc ? `${e.supplierRuc}-${e.supplierDv ?? ""}` : "",
      e.timbrado ?? "",
      e.tipoComprobante ?? "",
      e.numeroComprobante ?? "",
      e.category?.nameEs ?? "",
      e.moneda,
      String(e.gravada10),
      String(e.gravada5),
      String(e.exenta),
      String(e.iva10),
      String(e.iva5),
      String(e.total),
      e.status,
    ])
  );
  return csvResponse("gastos.csv", csv);
}
