import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { allowed } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { getSifenAdapterForCompany } from "@/lib/sifen";
import { logSifen } from "@/lib/sifen/log";
import { audit } from "@/lib/audit";
import { verifyComprobante } from "@/lib/comprobante-check";
import { cdcCheckSchema } from "@/lib/validators";

/**
 * Verify a RECEIVED comprobante by its CDC (PLAN Phase 5.8).
 *
 * POST { cdc, expenseId? }. With an `expenseId` the CDC is also cross-checked
 * against what we captured for that expense, and the verdict is stored on it.
 *
 * Needs `expenses:write` — it writes to the expense, and the consulta costs a
 * SIFEN round trip. Every query is persisted through `logSifen()` like every
 * other SIFEN call.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await allowed("expenses:write"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = cdcCheckSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const companyId = await getCompanyId();

  // Scoped by companyId as well as id — never trust an id alone.
  const expense = parsed.data.expenseId
    ? await prisma.expense.findFirst({
        where: { id: parsed.data.expenseId, companyId },
        select: {
          id: true,
          supplierRuc: true,
          numeroComprobante: true,
          fecha: true,
          tipoComprobante: true,
        },
      })
    : null;
  if (parsed.data.expenseId && !expense) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { adapter } = await getSifenAdapterForCompany(companyId);
  const result = await verifyComprobante(adapter, parsed.data.cdc, expense ?? undefined);

  // Logged whatever the verdict: a consulta that found nothing is exactly the
  // kind of thing worth being able to point at later.
  await logSifen({
    operation: "queryStatus",
    mode: adapter.mode,
    companyId,
    responseXml: result.status?.raw,
    success: result.verdict === "verified",
    detail: `consulta CDC ${result.cdc} → ${result.verdict}`,
  });

  if (expense) {
    await prisma.expense.updateMany({
      where: { id: expense.id, companyId },
      data: {
        cdc: result.cdc,
        cdcVerdict: result.verdict,
        cdcEstado: result.status?.estado ?? null,
        cdcMensaje: result.status?.message ?? null,
        cdcVerifiedAt: new Date(),
        cdcVerifiedBy: session.user.email ?? session.user.name ?? null,
      },
    });
    await audit("verify", "expense", expense.id, { cdc: result.cdc, verdict: result.verdict });
  }

  return NextResponse.json({
    cdc: result.cdc,
    verdict: result.verdict,
    findings: result.findings,
    parts: result.parts,
    estado: result.status?.estado ?? null,
    message: result.status?.message ?? null,
  });
}
