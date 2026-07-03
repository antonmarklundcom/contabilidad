import { NextResponse } from "next/server";
import fs from "fs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const companyId = await getCompanyId();
  const invoice = await prisma.invoice.findFirst({ where: { id, companyId } });
  if (!invoice?.kudePath || !fs.existsSync(invoice.kudePath)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  const data = await fs.promises.readFile(invoice.kudePath);
  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="KuDE-${invoice.fullNumber ?? invoice.id}.pdf"`,
    },
  });
}
