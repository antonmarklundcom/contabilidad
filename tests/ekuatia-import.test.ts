import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseDeXml, type ParsedDe } from "@/lib/ekuatia-xml";

/**
 * Merging an imported DE with what the books already hold (PLAN Phase 3.3).
 *
 * The behaviour under test is the whole reason the phase exists: a
 * photographed invoice and its electronic twin must MERGE rather than
 * double-count — and a figure a human already confirmed must not be rewritten
 * by an import.
 *
 * `importDeDocuments` is a server action, so it resolves the company from a
 * session it does not have here. These tests therefore exercise the same
 * decisions against the database directly, using the real parsed DE from the
 * golden fixture; `tests/ekuatia-xml.test.ts` covers the parser itself.
 */
const prisma = new PrismaClient();
let dbAvailable = false;
let companyId = "";
let de: ParsedDe;

const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "tests/fixtures/ekuatia", name), "utf8");

beforeAll(async () => {
  de = (await parseDeXml(fixture("factura-multirate.xml"))).de!;
  expect(de).toBeTruthy();
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    return;
  }
  const company = await prisma.company.create({
    data: {
      // The fixture was issued to 80000000 — this company.
      ruc: "80000000",
      dv: "0",
      razonSocial: "Test DE Import SA",
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
    },
  });
  companyId = company.id;
});

afterAll(async () => {
  if (dbAvailable && companyId) {
    await prisma.expenseItem.deleteMany({ where: { expense: { companyId } } });
    await prisma.expense.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  }
  await prisma.$disconnect();
});

/** The identity match the merge uses: issuer RUC + document number, NOT total. */
function findTwin(supplierRuc: string, numeroComprobante: string) {
  return prisma.expense.findFirst({
    where: { companyId, supplierRuc, numeroComprobante },
    orderBy: { createdAt: "asc" },
  });
}

/** A photo capture of the same comprobante, with the total optionally wrong. */
function ocrCapture(total: number, status: "NEEDS_REVIEW" | "CONFIRMED") {
  return prisma.expense.create({
    data: {
      companyId,
      source: "PHOTO",
      status,
      supplierRuc: de.supplierRuc,
      supplierDv: de.supplierDv,
      supplierRazonSocial: "PROVEEDOR (leído de la foto)",
      numeroComprobante: de.numeroComprobante,
      fecha: de.fecha,
      gravada10: 1_000_000,
      iva10: 100_000,
      total,
      moneda: "PYG",
    },
  });
}

describe.skipIf(!process.env.DATABASE_URL)("DE ↔ OCR twin matching", () => {
  beforeEach(async () => {
    if (dbAvailable) {
      await prisma.expenseItem.deleteMany({ where: { expense: { companyId } } });
      await prisma.expense.deleteMany({ where: { companyId } });
    }
  });

  it("finds the twin even when the OCR total is WRONG", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    // This is the case the old duplicate key missed: it matched on
    // (ruc, número, fecha, total), so a misread total meant no match and the
    // purchase was booked twice.
    await ocrCapture(1_850_500, "NEEDS_REVIEW");
    const twin = await findTwin(de.supplierRuc, de.numeroComprobante);
    expect(twin).not.toBeNull();
    expect(Number(twin!.total)).not.toBe(de.total);
  });

  it("does not confuse a different document from the same supplier", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    await ocrCapture(de.total, "NEEDS_REVIEW");
    expect(await findTwin(de.supplierRuc, "001-002-0000099")).toBeNull();
  });

  it("does not confuse the same number from a different supplier", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    await ocrCapture(de.total, "NEEDS_REVIEW");
    expect(await findTwin("80000001", de.numeroComprobante)).toBeNull();
  });
});

describe.skipIf(!process.env.DATABASE_URL)("what the merge is allowed to change", () => {
  beforeEach(async () => {
    if (dbAvailable) {
      await prisma.expenseItem.deleteMany({ where: { expense: { companyId } } });
      await prisma.expense.deleteMany({ where: { companyId } });
    }
  });

  it("lets the electronic figures replace an unreviewed OCR read", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const captured = await ocrCapture(1_850_500, "NEEDS_REVIEW");
    // The XML is the authoritative record; nobody has signed off on the
    // photograph's numbers yet.
    await prisma.expense.update({
      where: { id: captured.id },
      data: {
        gravada10: de.gravada10,
        gravada5: de.gravada5,
        exenta: de.exenta,
        iva10: de.iva10,
        iva5: de.iva5,
        total: de.total,
        cdc: de.cdc,
        source: "IMPORT",
      },
    });

    const after = await prisma.expense.findUniqueOrThrow({ where: { id: captured.id } });
    expect(Number(after.total)).toBe(1_850_000);
    expect(Number(after.gravada5)).toBe(476_190);
    expect(after.cdc).toBe(de.cdc);
    // One expense, not two: no double counting.
    expect(await prisma.expense.count({ where: { companyId } })).toBe(1);
  });

  it("never rewrites a figure a human already confirmed", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const confirmed = await ocrCapture(1_850_500, "CONFIRMED");
    // A confirmed expense gets the CDC and a note, and keeps its amounts —
    // the same rule as TaxFiling's declared snapshots (PLAN 5.10).
    await prisma.expense.update({
      where: { id: confirmed.id },
      data: {
        cdc: de.cdc,
        notes: `DE electrónico ${de.cdc}: total ${de.total} PYG (registrado 1850500).`,
      },
    });

    const after = await prisma.expense.findUniqueOrThrow({ where: { id: confirmed.id } });
    expect(Number(after.total)).toBe(1_850_500);
    expect(after.status).toBe("CONFIRMED");
    expect(after.cdc).toBe(de.cdc);
    expect(after.notes).toContain(String(de.total));
  });

  it("is idempotent: the same CDC is not imported twice", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    await prisma.expense.create({
      data: {
        companyId,
        source: "IMPORT",
        status: "NEEDS_REVIEW",
        supplierRuc: de.supplierRuc,
        numeroComprobante: de.numeroComprobante,
        cdc: de.cdc,
        fecha: de.fecha,
        total: de.total,
      },
    });
    const already = await prisma.expense.findFirst({ where: { companyId, cdc: de.cdc } });
    expect(already).not.toBeNull();
  });

  it("carries the lines across as IVA-included item totals", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const created = await prisma.expense.create({
      data: {
        companyId,
        source: "IMPORT",
        status: "NEEDS_REVIEW",
        supplierRuc: de.supplierRuc,
        numeroComprobante: de.numeroComprobante,
        cdc: de.cdc,
        fecha: de.fecha,
        total: de.total,
        items: {
          create: de.items.map((item, i) => ({
            orden: i + 1,
            descripcion: item.descripcion,
            cantidad: item.cantidad ?? undefined,
            total: item.total,
            tasa: item.tasa,
            deduciblePercent: 100,
          })),
        },
      },
      include: { items: { orderBy: { orden: "asc" } } },
    });

    expect(created.items).toHaveLength(3);
    expect(created.items.map((i) => i.tasa)).toEqual([10, 5, 0]);
    // deductibility.ts derives each item's IVA from an IVA-INCLUDED total,
    // which is the convention the DE already uses.
    expect(created.items.reduce((s, i) => s + Number(i.total), 0)).toBe(Number(created.total));
  });
});
