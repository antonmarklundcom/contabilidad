import { NextResponse } from "next/server";
import fs from "fs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const companyId = await getCompanyId();
  const invoice = await prisma.invoice.findFirst({ where: { id, companyId } });
  if (!invoice?.signedXmlPath || !fs.existsSync(invoice.signedXmlPath)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const data = await fs.promises.readFile(invoice.signedXmlPath);
  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="DE-${invoice.fullNumber ?? invoice.id}.xml"`,
    },
  });
}
