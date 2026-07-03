import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSifenAdapterForCompany } from "@/lib/sifen";
import { logSifen } from "@/lib/sifen/log";
import { splitRuc, validarRuc } from "@/lib/sifen/ruc";

/** Queries a RUC through the SIFEN adapter (mock: simulated data). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ruc: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { ruc } = await params;
  const parts = splitRuc(ruc);
  if (!parts || !validarRuc(parts.ruc, parts.dv)) {
    return NextResponse.json({ error: "invalid_ruc" }, { status: 400 });
  }
  try {
    const { adapter, company } = await getSifenAdapterForCompany();
    const info = await adapter.queryRuc(`${parts.ruc}-${parts.dv}`);
    await logSifen({
      operation: "queryRuc",
      mode: adapter.mode,
      companyId: company.id,
      responseXml: info.raw,
      success: true,
      detail: `${parts.ruc}-${parts.dv}`,
    });
    return NextResponse.json({
      ruc: info.ruc,
      dv: info.dv,
      razonSocial: info.razonSocial,
      estado: info.estado,
      facturadorElectronico: info.facturadorElectronico ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: String((err as Error).message) }, { status: 502 });
  }
}
