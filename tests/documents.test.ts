import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  isAllowedMimeType,
  storedFilename,
  MAX_DOCUMENT_BYTES,
  createDocument,
  getDocument,
  listDocuments,
  linkExistingFile,
  updateDocumentMeta,
} from "@/lib/documents";
import { getDict, translate } from "@/lib/i18n";

/**
 * PLAN Phase 6.1–6.2 — the document vault.
 *
 * The pure half (accepted types, stored names) runs everywhere. The scoping
 * half is the important one: a document is only ever reachable through its own
 * company, never by id alone.
 */

describe("vault upload rules (pure)", () => {
  it("accepts documents and rejects everything else", () => {
    for (const ok of ["application/pdf", "image/jpeg", "image/png", "text/csv"]) {
      expect(isAllowedMimeType(ok)).toBe(true);
    }
    for (const bad of ["application/x-msdownload", "text/html", "application/zip", ""]) {
      expect(isAllowedMimeType(bad)).toBe(false);
    }
  });

  it("keeps the extension but never the caller's path or name", () => {
    const name = storedFilename("../../etc/passwd.pdf");
    expect(name).toMatch(/^doc-[a-z0-9-]+\.pdf$/);
    expect(name).not.toContain("/");
    expect(storedFilename("sin-extension")).toMatch(/^doc-[a-z0-9-]+$/);
  });

  it("caps uploads at 20 MB", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(20 * 1024 * 1024);
  });

  it("has vault copy in both locales", () => {
    for (const locale of ["es", "en"] as const) {
      const dict = getDict(locale);
      for (const key of ["documents.title", "documents.upload", "status.BANK_STATEMENT"]) {
        expect(translate(dict, key)).not.toBe(key);
      }
    }
  });
});

const prisma = new PrismaClient();
let dbAvailable = false;
let companyId = "";
let otherCompanyId = "";

const company = (ruc: string, name: string) => ({
  ruc,
  dv: "1",
  razonSocial: name,
  actividades: [],
  timbradoNumero: "12345678",
  timbradoFechaInicio: new Date("2026-01-01"),
  direccion: "Calle Test 123",
  departamento: 11,
  departamentoDescripcion: "CENTRAL",
  distrito: 1,
  distritoDescripcion: "ASUNCION",
  ciudad: 1,
  ciudadDescripcion: "ASUNCION",
});

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    return;
  }
  companyId = (await prisma.company.create({ data: company("90000054", "Vault SA") })).id;
  otherCompanyId = (await prisma.company.create({ data: company("90000064", "Otra SA") })).id;
});

afterAll(async () => {
  if (dbAvailable) {
    for (const id of [companyId, otherCompanyId].filter(Boolean)) {
      await prisma.document.deleteMany({ where: { companyId: id } });
      await prisma.company.delete({ where: { id } });
    }
  }
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DATABASE_URL)("document vault (database)", () => {
  it("stores a file and records its metadata", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const doc = await createDocument({
      companyId,
      kind: "BANK_STATEMENT",
      title: "Extracto julio",
      mimeType: "application/pdf",
      content: Buffer.from("%PDF-1.4 fake"),
      originalName: "extracto.pdf",
      receivedAt: new Date("2026-07-31"),
      uploadedBy: "contador@example.com",
      notes: "Banco Demo",
    });

    expect(doc.sizeBytes).toBe(13);
    expect(doc.filePath).toContain("/documents/");
    expect(doc.kind).toBe("BANK_STATEMENT");
  });

  it("never returns another company's document", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const theirs = await createDocument({
      companyId: otherCompanyId,
      kind: "CONTRACT",
      title: "Contrato ajeno",
      mimeType: "application/pdf",
      content: Buffer.from("x"),
      originalName: "contrato.pdf",
    });

    expect(await getDocument(otherCompanyId, theirs.id)).not.toBeNull();
    // The id alone is not enough — this is the deny path that matters.
    expect(await getDocument(companyId, theirs.id)).toBeNull();

    const { rows } = await listDocuments(companyId, { pageSize: 100 });
    expect(rows.some((r) => r.id === theirs.id)).toBe(false);

    // Nor can it be edited through the wrong company.
    expect(
      await updateDocumentMeta(companyId, theirs.id, {
        title: "secuestrado",
        kind: "OTHER",
        receivedAt: new Date(),
        notes: "",
      })
    ).toBe(0);
    const untouched = await prisma.document.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(untouched.title).toBe("Contrato ajeno");
  });

  it("filters by kind, date range and free text", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    await createDocument({
      companyId,
      kind: "DNIT_NOTICE",
      title: "Notificación DNIT 2026",
      mimeType: "application/pdf",
      content: Buffer.from("y"),
      originalName: "aviso.pdf",
      receivedAt: new Date("2026-03-10"),
    });

    expect((await listDocuments(companyId, { kind: "DNIT_NOTICE" })).count).toBe(1);
    expect((await listDocuments(companyId, { q: "notificación" })).count).toBe(1);
    expect(
      (await listDocuments(companyId, { from: "2026-01-01", to: "2026-03-31" })).count
    ).toBe(1);
    // An unknown kind is ignored rather than returning nothing.
    expect((await listDocuments(companyId, { kind: "NOT_A_KIND" })).count).toBeGreaterThan(1);
  });

  it("links an existing file once, however often it is asked", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    // A path only: linkExistingFile records a file that already exists in
    // storage (the Phase 5 filing receipt) and writes nothing itself.
    const filePath = "storage/filings/dnit-IVA-2026-05.pdf";
    const first = await linkExistingFile({
      companyId,
      kind: "FILING",
      title: "DNIT IVA 2026-05",
      filePath,
      mimeType: "application/pdf",
      sizeBytes: 1234,
    });
    const second = await linkExistingFile({
      companyId,
      kind: "FILING",
      title: "DNIT IVA 2026-05",
      filePath,
      mimeType: "application/pdf",
      sizeBytes: 1234,
    });
    expect(second.id).toBe(first.id);
    expect(
      await prisma.document.count({ where: { companyId, filePath } })
    ).toBe(1);
  });
});
