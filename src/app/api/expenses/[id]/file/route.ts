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
  const expense = await prisma.expense.findFirst({ where: { id, companyId } });
  if (!expense?.filePath || !fs.existsSync(expense.filePath)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const data = await fs.promises.readFile(expense.filePath);
  return new NextResponse(data, {
    headers: {
      "Content-Type": expense.fileMime ?? "application/octet-stream",
      "Content-Disposition": "inline",
    },
  });
}
