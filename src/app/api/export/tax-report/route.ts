import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCompanyId } from "@/lib/company";
import { renderMonthlyReportPdf } from "@/lib/tax/monthly-report";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const companyId = await getCompanyId();
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const month = Number(url.searchParams.get("month")) || new Date().getMonth() + 1;

  // Same assembly the emailed copy uses (src/lib/tax/monthly-report.ts), so
  // the download and the mailed report are the same document.
  const pdf = await renderMonthlyReportPdf(companyId, year, month);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="informe-mensual-${year}-${String(month).padStart(2, "0")}.pdf"`,
    },
  });
}
