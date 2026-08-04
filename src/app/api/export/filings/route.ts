import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCompanyId } from "@/lib/company";
import { listFilings } from "@/lib/tax/filing";
import { toCsv, csvResponse } from "@/lib/csv";
import type { Form120Data } from "@/lib/form120";

const HEADERS = [
  "tipo",
  "periodo",
  "estado",
  "vencimiento",
  "debito_fiscal",
  "credito_fiscal",
  "saldo_anterior",
  "a_pagar",
  "saldo_a_favor",
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
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    page: 1,
    pageSize: 10_000,
  });

  const values = rows.map((f) => {
    const s = f.snapshot as unknown as Partial<Form120Data> | null;
    return [
      f.type,
      f.month === null ? String(f.year) : `${f.year}-${String(f.month).padStart(2, "0")}`,
      f.status,
      iso(f.dueDate),
      s?.ventas?.debitoFiscal ?? 0,
      s?.compras?.creditoFiscal ?? 0,
      s?.saldoAnterior ?? 0,
      s?.aPagar ?? 0,
      s?.saldoAFavor ?? 0,
      f.closedBy ?? "",
      iso(f.closedAt),
      iso(f.submittedAt),
      iso(f.paidAt),
      f.officialPdfPath ? "si" : "no",
    ];
  });

  return csvResponse("declaraciones.csv", toCsv(HEADERS, values));
}
