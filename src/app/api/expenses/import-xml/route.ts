import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { allowed } from "@/lib/authz";
import { parseDeXml, type ParsedDe } from "@/lib/ekuatia-xml";
import { importDeDocuments } from "@/app/(app)/expenses/actions";

export const maxDuration = 60;

/**
 * e-Kuatiá DE XML import (PLAN Phase 3.1).
 *
 * Accepts one or more `.xml` files — the electronic documents a taxpayer
 * downloads for the comprobantes issued to them. Batch by design: nobody
 * downloads one.
 *
 * Parse failures are reported PER FILE and never abort the batch: one
 * corrupted download must not cost the user the other forty-nine.
 */

// Browsers disagree about the type of an .xml file, so the extension decides
// and the MIME type only broadens what is accepted.
const ALLOWED_TYPES = ["text/xml", "application/xml", "application/octet-stream", ""];
const MAX_FILES = 200;
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await allowed("expenses:write"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: "too_many" }, { status: 400 });

  const documents: ParsedDe[] = [];
  const failures: { file: string; error: string }[] = [];

  for (const file of files) {
    if (!/\.xml$/i.test(file.name) && !ALLOWED_TYPES.includes(file.type)) {
      failures.push({ file: file.name, error: "bad_type" });
      continue;
    }
    if (file.size > MAX_BYTES) {
      failures.push({ file: file.name, error: "too_large" });
      continue;
    }
    const parsed = await parseDeXml(await file.text());
    if (!parsed.ok || !parsed.de) {
      failures.push({ file: file.name, error: parsed.error ?? "not_xml" });
      continue;
    }
    documents.push(parsed.de);
  }

  const result = await importDeDocuments(documents);

  return NextResponse.json({
    ...result,
    errors: failures.length,
    errorFiles: failures.slice(0, 20),
  });
}
