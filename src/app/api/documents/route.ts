import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCompanyId } from "@/lib/company";
import { audit } from "@/lib/audit";
import {
  createDocument,
  isAllowedMimeType,
  MAX_DOCUMENT_BYTES,
  DOCUMENT_KINDS,
} from "@/lib/documents";
import type { DocumentKind } from "@prisma/client";

/**
 * Vault upload (multipart), same shape as /api/expenses/upload.
 *
 * The file is stored under STORAGE_DIR/documents and recorded against the
 * session's company. Type and size are checked here rather than trusted from
 * the browser.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const companyId = await getCompanyId();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (!isAllowedMimeType(file.type)) {
    return NextResponse.json({ error: "bad_type" }, { status: 400 });
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const kindRaw = String(form.get("kind") ?? "OTHER");
  const kind = (DOCUMENT_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as DocumentKind)
    : "OTHER";
  const title = String(form.get("title") ?? "").trim() || file.name;
  const receivedAtRaw = String(form.get("receivedAt") ?? "").trim();
  const receivedAt = receivedAtRaw ? new Date(receivedAtRaw) : new Date();

  const doc = await createDocument({
    companyId,
    kind,
    title: title.slice(0, 255),
    mimeType: file.type,
    content: Buffer.from(await file.arrayBuffer()),
    originalName: file.name,
    receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
    uploadedBy: session.user.email ?? session.user.name ?? null,
    notes: String(form.get("notes") ?? "").trim() || null,
  });

  await audit("upload", "document", doc.id, { kind: doc.kind, sizeBytes: doc.sizeBytes });
  return NextResponse.json({ ok: true, id: doc.id });
}
