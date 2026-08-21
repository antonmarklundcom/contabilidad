import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCompanyId } from "@/lib/company";
import { listDocuments } from "@/lib/documents";
import { toCsv, csvResponse } from "@/lib/csv";

const HEADERS = ["titulo", "tipo", "fecha", "tamano_bytes", "subido_por", "notas"];

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const companyId = await getCompanyId();
  const url = new URL(req.url);

  // Export the whole filtered set, not just the visible page.
  const { rows } = await listDocuments(companyId, {
    q: url.searchParams.get("q") ?? undefined,
    kind: url.searchParams.get("status") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    page: 1,
    pageSize: 10_000,
  });

  const csv = toCsv(
    HEADERS,
    rows.map((d) => [
      d.title,
      d.kind,
      d.receivedAt.toISOString().slice(0, 10),
      d.sizeBytes,
      d.uploadedBy ?? "",
      d.notes ?? "",
    ])
  );
  return csvResponse("documentos.csv", csv);
}
