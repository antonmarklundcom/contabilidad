import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCompanyId } from "@/lib/company";
import { libroVentas, libroCompras, type LibroRow, type LibroTotals } from "@/lib/accounting";
import { toCsv, csvResponse } from "@/lib/csv";

const HEADERS = [
  "fecha", "tipo", "numero", "timbrado", "ruc", "razon_social",
  "gravada_10", "gravada_5", "exenta", "iva_10", "iva_5", "total",
];

function rowValues(r: LibroRow): (string | number)[] {
  return [
    r.fecha ? r.fecha.toISOString().slice(0, 10) : "",
    r.tipo, r.numero, r.timbrado, r.ruc, r.razonSocial,
    r.gravada10, r.gravada5, r.exenta, r.iva10, r.iva5, r.total,
  ];
}

function totalsRow(t: LibroTotals): (string | number)[] {
  return ["TOTALES", "", "", "", "", "", t.gravada10, t.gravada5, t.exenta, t.iva10, t.iva5, t.total];
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const companyId = await getCompanyId();
  const url = new URL(req.url);
  const book = url.searchParams.get("book") === "compras" ? "compras" : "ventas";
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const month = Number(url.searchParams.get("month")) || new Date().getMonth() + 1;

  const data = book === "ventas"
    ? await libroVentas(companyId, year, month)
    : await libroCompras(companyId, year, month);

  const name = `libro-iva-${book}-${year}-${String(month).padStart(2, "0")}`;

  if (format === "xlsx") {
    const aoa = [HEADERS, ...data.rows.map(rowValues), totalsRow(data.totals)];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, book === "ventas" ? "Ventas" : "Compras");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      },
    });
  }

  const csv = toCsv(HEADERS, [...data.rows.map(rowValues), totalsRow(data.totals)]);
  return csvResponse(`${name}.csv`, csv);
}
