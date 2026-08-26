import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCompanyId } from "@/lib/company";
import { listFilings } from "@/lib/tax/filing";
import { periodLabel } from "@/lib/tax/filing-period";
import { toCsv, csvResponse } from "@/lib/csv";
import type { Form120Data } from "@/lib/form120";
import type { IrpData } from "@/lib/irp";

/**
 * IVA and IRP filings share the archive but not their snapshot shape, so the
 * columns of the tax a row is not are left EMPTY rather than zero: a blank
 * says "this figure does not exist for this filing", a 0 would claim the
 * taxpayer owed nothing.
 */
const HEADERS = [
  "tipo",
  "periodo",
  "estado",
  "vencimiento",
  // IVA (Formulario 120) columns.
  "debito_fiscal",
  "credito_fiscal",
  "saldo_anterior",
  "a_pagar",
  "saldo_a_favor",
  // IRP annual columns.
  "regimen",
  "renta_bruta",
  "egresos_deducibles",
  "renta_neta_imponible",
  "impuesto_irp",
  // Lifecycle.
  "cerrado_por",
  "cerrado_el",
  "presentado_el",
  "pagado_el",
  "comprobante_dnit",
];

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const companyId = await getCompanyId();
  const url = new URL(req.url);

  // Export the whole filtered set, not just the visible page.
  const { rows } = await listFilings(companyId, {
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    page: 1,
    pageSize: 10_000,
  });

  const values = rows.map((f) => {
    const isIva = f.type === "IVA";
    const s = isIva ? (f.snapshot as unknown as Partial<Form120Data> | null) : null;
    const irp = isIva ? null : (f.snapshot as unknown as Partial<IrpData> | null);
    return [
      f.type,
      periodLabel(f.year, f.month),
      f.status,
      iso(f.dueDate),
      s ? (s.ventas?.debitoFiscal ?? 0) : "",
      s ? (s.compras?.creditoFiscal ?? 0) : "",
      s ? (s.saldoAnterior ?? 0) : "",
      s ? (s.aPagar ?? 0) : "",
      s ? (s.saldoAFavor ?? 0) : "",
      irp?.regime ?? "",
      irp ? (irp.ingresos?.rentaBruta ?? 0) : "",
      irp ? (irp.egresos?.egresoDeducible ?? 0) : "",
      irp ? (irp.rentaNetaImponible ?? 0) : "",
      irp ? (irp.impuesto ?? 0) : "",
      f.closedBy ?? "",
      iso(f.closedAt),
      iso(f.submittedAt),
      iso(f.paidAt),
      f.officialPdfPath ? "si" : "no",
    ];
  });

  return csvResponse("declaraciones.csv", toCsv(HEADERS, values));
}
