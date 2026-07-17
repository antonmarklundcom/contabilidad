import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseMarangatuFile } from "@/lib/marangatu-import";
import { importMarangatuRows } from "@/app/(app)/expenses/actions";

export const maxDuration = 60;

const ALLOWED = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  const isCsvExt = file.name.toLowerCase().endsWith(".csv");
  const isXlsxExt = /\.(xlsx|xls)$/i.test(file.name);
  if (!isCsvExt && !isXlsxExt && !ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "bad_type" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseMarangatuFile(buffer, file.name);
  const validRows = parsed.filter((r) => r.data).map((r) => r.data!);
  const errors = parsed.filter((r) => r.error);

  const { created, skipped } = await importMarangatuRows(validRows);

  return NextResponse.json({
    created,
    skipped,
    errors: errors.length,
    errorRows: errors.slice(0, 20).map((e) => ({ row: e.row, error: e.error })),
  });
}
