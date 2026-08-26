import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { allowed } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { buildIrp, getIrpRegime, isIrpRegime, type IrpRegime } from "@/lib/irp";
import { getAnnualClose } from "@/lib/tax/filing";
import { generateIrpPdf } from "@/lib/tax-report";
import { getSifenMode } from "@/lib/sifen";

/**
 * The IRP annual working draft as a PDF (PLAN Phase 7.2).
 *
 * Once the year is closed the DECLARED snapshot is printed rather than a
 * fresh computation: the whole point of freezing a filing is that the
 * document you hand someone months later says what was signed off, not what
 * the books happen to add up to today.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await allowed("taxes:close"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const companyId = await getCompanyId();
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear() - 1;

  const requested = url.searchParams.get("regime");
  const stored = await getIrpRegime(companyId);
  const regime: IrpRegime = isIrpRegime(requested) ? requested : (stored ?? "RSP");

  const [company, closed] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    getAnnualClose(companyId, year),
  ]);
  const data = closed ? closed.snapshot : await buildIrp(companyId, year, regime);
  const pdf = await generateIrpPdf(company, data, getSifenMode());

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="irp-borrador-${year}.pdf"`,
    },
  });
}
