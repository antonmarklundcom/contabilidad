import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCompanyId } from "@/lib/company";
import { prisma } from "@/lib/prisma";
import { saveFile, readFile } from "@/lib/storage";
import { attachOfficialPdf } from "@/lib/tax/filing";
import { audit } from "@/lib/audit";

/**
 * The DNIT receipt PDF for a filing.
 *
 * POST stores one under STORAGE_DIR/filings; GET streams it back. Like every
 * other tax document the file is written once and never deleted — replacing it
 * writes a NEW file and repoints the filing, leaving the previous one on disk.
 */

async function filingForRequest(id: string) {
  const companyId = await getCompanyId();
  const filing = await prisma.taxFiling.findFirst({ where: { id, companyId } });
  return { companyId, filing };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const { companyId, filing } = await filingForRequest(id);
  if (!filing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "bad_type" }, { status: 400 });
  }
  // DNIT acknowledgements are small; cap to keep a bad upload from filling disk.
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const period =
    filing.month === null
      ? String(filing.year)
      : `${filing.year}-${String(filing.month).padStart(2, "0")}`;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await saveFile("filings", `dnit-${filing.type}-${period}-${stamp}.pdf`, buffer);

  await attachOfficialPdf(companyId, filing.id, stored);
  await audit("upload", "taxFiling", filing.id, { officialPdf: true, period });

  return NextResponse.json({ ok: true });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const { filing } = await filingForRequest(id);
  if (!filing?.officialPdfPath) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    // readFile refuses anything outside the storage root.
    const buf = await readFile(filing.officialPdfPath);
    const period =
      filing.month === null
        ? String(filing.year)
        : `${filing.year}-${String(filing.month).padStart(2, "0")}`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="dnit-${filing.type}-${period}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "unreadable" }, { status: 404 });
  }
}
