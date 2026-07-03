import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { buildInvoiceWhere } from "@/lib/invoice-query";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const companyId = await getCompanyId();
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const invoices = await prisma.invoice.findMany({
    where: buildInvoiceWhere(companyId, params),
    orderBy: { issueDate: "asc" },
    include: { client: true },
    take: 10000,
  });
  const csv = toCsv(
    [
      "numero", "tipo", "estado", "fecha", "cliente", "ruc",
      "moneda", "gravada10", "gravada5", "exenta", "iva10", "iva5", "total_iva", "total", "cdc",
    ],
    invoices.map((i) => [
      i.fullNumber ?? "(borrador)",
      i.tipoDocumento,
      i.status,
      i.issueDate.toISOString().slice(0, 10),
      i.client.razonSocial,
      i.client.ruc ? `${i.client.ruc}-${i.client.dv}` : (i.client.documentoNumero ?? ""),
      i.moneda,
      String(i.totalGravada10),
      String(i.totalGravada5),
      String(i.totalExenta),
      String(i.totalIva10),
      String(i.totalIva5),
      String(i.totalIva),
      String(i.total),
      i.cdc ?? "",
    ])
  );
  return csvResponse("facturas.csv", csv);
}
