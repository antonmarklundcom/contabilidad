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
  const clients = await prisma.client.findMany({
    where: { companyId },
    orderBy: { razonSocial: "asc" },
    take: 10000,
  });
  const csv = toCsv(
    ["razon_social", "tipo_documento", "ruc", "dv", "documento", "email", "telefono", "direccion", "pais"],
    clients.map((c) => [
      c.razonSocial, c.docType, c.ruc ?? "", c.dv ?? "", c.documentoNumero ?? "",
      c.email ?? "", c.telefono ?? "", c.direccion ?? "", c.pais,
    ])
  );
  return csvResponse("clientes.csv", csv);
}
