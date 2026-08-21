import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCompanyId } from "@/lib/company";
import { getDocument } from "@/lib/documents";
import { readFile } from "@/lib/storage";

/** Streams a vault document back. Scoped to the session's company. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const companyId = await getCompanyId();
  const { id } = await params;
  const doc = await getDocument(companyId, id);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    // readFile refuses anything outside the storage root.
    const buf = await readFile(doc.filePath);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `inline; filename="${doc.title.replace(/["\\]/g, "")}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "unreadable" }, { status: 404 });
  }
}
