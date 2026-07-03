import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const companyId = await getCompanyId();
  const products = await prisma.product.findMany({
    where: { companyId },
    orderBy: { codigo: "asc" },
    take: 10000,
  });
  const csv = toCsv(
    ["codigo", "descripcion_es", "descripcion_en", "tipo", "unidad", "precio", "moneda", "iva", "activo"],
    products.map((p) => [
      p.codigo, p.descripcionEs, p.descripcionEn ?? "", p.tipo, p.unidadMedida,
      String(p.precioUnitario), p.moneda,
      p.ivaRate === "IVA_10" ? "10" : p.ivaRate === "IVA_5" ? "5" : "exenta",
      p.active ? "1" : "0",
    ])
  );
  return csvResponse("productos.csv", csv);
}
