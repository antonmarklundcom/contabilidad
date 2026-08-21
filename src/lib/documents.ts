/**
 * The document vault (PLAN Phase 6.1–6.2).
 *
 * Bank statements, DNIT notices, contracts, certificates — plus the filing
 * receipts Phase 5 already stores, which get a `Document` row pointing at the
 * same file so the vault is not a second silo.
 *
 * Every query is scoped by `companyId` as well as id: an id alone is never
 * trusted. Files are written once under `STORAGE_DIR/documents` and never
 * deleted, like every other tax-document bucket.
 */
import { prisma } from "@/lib/prisma";
import type { Document, DocumentKind, Prisma } from "@prisma/client";
import { saveFile } from "@/lib/storage";

export const DOCUMENT_KINDS: readonly DocumentKind[] = [
  "BANK_STATEMENT",
  "DNIT_NOTICE",
  "CONTRACT",
  "CERTIFICATE",
  "FILING",
  "OTHER",
];

/** Types the vault accepts. Deliberately narrow: documents, not executables. */
export const ALLOWED_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/** 20 MB — a scanned statement, not a video. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export function isAllowedMimeType(mime: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mime);
}

/** A filesystem-safe, collision-proof name that keeps the original extension. */
export function storedFilename(originalName: string): string {
  const extension = (originalName.match(/\.[a-zA-Z0-9]{1,8}$/)?.[0] ?? "").toLowerCase();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `doc-${stamp}${extension}`;
}

export interface CreateDocumentInput {
  companyId: string;
  kind: DocumentKind;
  title: string;
  mimeType: string;
  content: Buffer;
  originalName: string;
  receivedAt?: Date;
  uploadedBy?: string | null;
  notes?: string | null;
}

/** Stores the file and records it. */
export async function createDocument(input: CreateDocumentInput): Promise<Document> {
  const filePath = await saveFile("documents", storedFilename(input.originalName), input.content);
  return prisma.document.create({
    data: {
      companyId: input.companyId,
      kind: input.kind,
      title: input.title,
      filePath,
      mimeType: input.mimeType,
      sizeBytes: input.content.length,
      receivedAt: input.receivedAt ?? new Date(),
      uploadedBy: input.uploadedBy ?? null,
      notes: input.notes || null,
    },
  });
}

/**
 * Records a file that already lives in storage — the Phase 5 filing receipts.
 *
 * Idempotent on `filePath`: re-linking the same file does not create a second
 * row, so a route can call it freely.
 */
export async function linkExistingFile(input: {
  companyId: string;
  kind: DocumentKind;
  title: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  receivedAt?: Date;
  uploadedBy?: string | null;
}): Promise<Document> {
  const existing = await prisma.document.findFirst({
    where: { companyId: input.companyId, filePath: input.filePath },
  });
  if (existing) return existing;
  return prisma.document.create({
    data: {
      companyId: input.companyId,
      kind: input.kind,
      title: input.title,
      filePath: input.filePath,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      receivedAt: input.receivedAt ?? new Date(),
      uploadedBy: input.uploadedBy ?? null,
    },
  });
}

/** One document, or null when it belongs to another company. */
export function getDocument(companyId: string, id: string): Promise<Document | null> {
  return prisma.document.findFirst({ where: { id, companyId } });
}

export interface DocumentListFilters {
  q?: string;
  kind?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** The vault list, following the standard list-controls contract. */
export async function listDocuments(companyId: string, filters: DocumentListFilters = {}) {
  const pageSize = filters.pageSize ?? 25;
  const page = Math.max(1, filters.page ?? 1);
  const kind = DOCUMENT_KINDS.includes(filters.kind as DocumentKind)
    ? (filters.kind as DocumentKind)
    : undefined;

  const where: Prisma.DocumentWhereInput = {
    companyId,
    ...(kind ? { kind } : {}),
    ...(filters.from || filters.to
      ? {
          receivedAt: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59`) } : {}),
          },
        }
      : {}),
  };

  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
      { uploadedBy: { contains: q, mode: "insensitive" } },
    ];
  }

  const [rows, count] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.document.count({ where }),
  ]);

  return { rows, count, page, pages: Math.max(1, Math.ceil(count / pageSize)) };
}

/**
 * Edits the metadata of a document. The file itself is never touched — a
 * replacement is a new upload, exactly like a filing receipt.
 */
export async function updateDocumentMeta(
  companyId: string,
  id: string,
  data: { title: string; kind: DocumentKind; receivedAt: Date; notes: string }
): Promise<number> {
  const res = await prisma.document.updateMany({
    where: { id, companyId },
    data: {
      title: data.title,
      kind: data.kind,
      receivedAt: data.receivedAt,
      notes: data.notes || null,
    },
  });
  return res.count;
}
