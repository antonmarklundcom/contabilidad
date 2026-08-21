import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildReconciliation } from "@/lib/reconcile";

/**
 * Golden-file test for the period reconciliation: one fixture period, one
 * expected findings list. `reconcile.ts` decides whether a period may be
 * closed, so its output is money-adjacent even though it computes no money.
 *
 * Needs a reachable DATABASE_URL; skips gracefully without one, matching
 * tests/sequence.test.ts.
 */
const prisma = new PrismaClient();
let dbAvailable = false;
let companyId = "";

const RUC = "90000044";
const YEAR = 2026;
const MONTH = 5;

/** In-period date. */
const d = (day: number) => new Date(Date.UTC(YEAR, MONTH - 1, day));

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    return;
  }
  const company = await prisma.company.create({
    data: {
      ruc: RUC,
      dv: "1",
      razonSocial: "Test Reconcile SA",
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

  const est = await prisma.establishment.create({ data: { companyId, codigo: "001" } });
  const point = await prisma.expeditionPoint.create({
    data: { companyId, establishmentId: est.id, codigo: "001" },
  });
  // The counter is ahead of the last document: 6 was reserved, never used.
  await prisma.documentSequence.create({
    data: { companyId, expeditionPointId: point.id, tipoDocumento: 1, currentNumber: 6 },
  });

  const client = await prisma.client.create({
    data: { companyId, ruc: "80012345", dv: "0", razonSocial: "CLIENTE DEMO SA" },
  });

  const invoice = (numero: string, status: "APPROVED" | "DRAFT" | "REJECTED" | "CANCELLED", day: number) =>
    prisma.invoice.create({
      data: {
        companyId,
        clientId: client.id,
        status,
        establecimiento: "001",
        punto: "001",
        numero,
        fullNumber: `001-001-${numero}`,
        issueDate: d(day),
        total: 100_000,
      },
    });

  // 0000001 approved, 0000002 missing (a gap), 0000003 approved,
  // 0000004 rejected (still consumed its number), 0000005 cancelled.
  await invoice("0000001", "APPROVED", 3);
  await invoice("0000003", "APPROVED", 10);
  await invoice("0000004", "REJECTED", 12);
  await invoice("0000005", "CANCELLED", 20);
  // A draft dated in the period, never numbered: unresolved, not a gap.
  await prisma.invoice.create({
    data: {
      companyId,
      clientId: client.id,
      status: "DRAFT",
      establecimiento: "001",
      punto: "001",
      issueDate: d(15),
      total: 50_000,
    },
  });

  await prisma.expense.create({
    data: {
      companyId,
      status: "NEEDS_REVIEW",
      supplierRazonSocial: "PROVEEDOR PENDIENTE",
      numeroComprobante: "001-001-0000900",
      fecha: d(8),
      total: 200_000,
    },
  });
  const original = await prisma.expense.create({
    data: {
      companyId,
      status: "CONFIRMED",
      supplierRazonSocial: "PROVEEDOR OK",
      numeroComprobante: "001-001-0000901",
      fecha: d(9),
      total: 300_000,
    },
  });
  await prisma.expense.create({
    data: {
      companyId,
      status: "CONFIRMED",
      supplierRazonSocial: "PROVEEDOR OK",
      numeroComprobante: "001-001-0000901",
      fecha: d(9),
      total: 300_000,
      duplicateOfId: original.id,
    },
  });
  // Outside the period: must not appear anywhere in the findings.
  await prisma.expense.create({
    data: {
      companyId,
      status: "NEEDS_REVIEW",
      supplierRazonSocial: "OTRO PERIODO",
      fecha: new Date(Date.UTC(YEAR, MONTH, 9)),
      total: 400_000,
    },
  });
});

afterAll(async () => {
  if (dbAvailable && companyId) {
    await prisma.expense.deleteMany({ where: { companyId } });
    await prisma.invoice.deleteMany({ where: { companyId } });
    await prisma.client.deleteMany({ where: { companyId } });
    await prisma.documentSequence.deleteMany({ where: { companyId } });
    await prisma.expeditionPoint.deleteMany({ where: { companyId } });
    await prisma.establishment.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  }
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DATABASE_URL)("buildReconciliation — fixture period", () => {
  it("produces exactly the expected findings", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const result = await buildReconciliation(companyId, YEAR, MONTH);

    expect(result.year).toBe(YEAR);
    expect(result.month).toBe(MONTH);

    // A rejected invoice and a never-emitted draft both block the close; an
    // approved or cancelled one does not.
    expect(
      result.unresolvedInvoices.map((i) => [i.fullNumber, i.status]).sort()
    ).toEqual([
      [null, "DRAFT"],
      ["001-001-0000004", "REJECTED"],
    ]);

    expect(
      result.unresolvedExpenses.map((e) => [e.supplierRazonSocial, e.reason]).sort()
    ).toEqual([
      ["PROVEEDOR OK", "DUPLICATE_SUSPECT"],
      ["PROVEEDOR PENDIENTE", "NEEDS_REVIEW"],
    ]);

    // 0000002 was never emitted; 0000006 was reserved and never used.
    expect(result.sequenceGaps).toEqual([
      {
        establecimiento: "001",
        punto: "001",
        tipoDocumento: 1,
        from: 2,
        to: 2,
        count: 1,
        trailing: false,
      },
      {
        establecimiento: "001",
        punto: "001",
        tipoDocumento: 1,
        from: 6,
        to: 6,
        count: 1,
        trailing: true,
      },
    ]);

    // Gaps are a disclosure, not a blocker — `clean` is decided by the
    // resolvable findings alone.
    expect(result.clean).toBe(false);
  });

  it("reports a period with nothing in it as clean", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const result = await buildReconciliation(companyId, YEAR, 1);
    expect(result.unresolvedInvoices).toEqual([]);
    expect(result.unresolvedExpenses).toEqual([]);
    expect(result.sequenceGaps).toEqual([]);
    expect(result.clean).toBe(true);
  });
});
