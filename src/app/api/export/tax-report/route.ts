import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { getPeriodClose } from "@/lib/form120";
import { buildMonthlyReportInput } from "@/lib/tax-close";
import { generateMonthlyReportPdf } from "@/lib/tax-report";
import { getSifenMode } from "@/lib/sifen";
import { readFile, storagePath } from "@/lib/storage";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const companyId = await getCompanyId();
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const month = Number(url.searchParams.get("month")) || new Date().getMonth() + 1;

  // Closed period → serve the frozen artifact, never a live regeneration.
  const close = await getPeriodClose(companyId, year, month);
  if (close?.files) {
    const frozen = await readFile(storagePath("exports", close.files.report));
    return new NextResponse(new Uint8Array(frozen), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="informe-mensual-${year}-${String(month).padStart(2, "0")}.pdf"`,
      },
    });
  }

  const [company, input] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    buildMonthlyReportInput(companyId, year, month),
  ]);

  const pdf = await generateMonthlyReportPdf(company, input, getSifenMode());

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="informe-mensual-${year}-${String(month).padStart(2, "0")}.pdf"`,
    },
  });
}
