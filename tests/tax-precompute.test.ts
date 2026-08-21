import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { lastClosedPeriod, precomputeMonthEndDrafts } from "@/lib/tax/precompute";
import { getDict, translate } from "@/lib/i18n";

/**
 * PLAN Phase 5.7 — the month-end draft is computed by cron so it is already
 * waiting at login, and the close report is emailed after a period close.
 *
 * The period arithmetic is pure; the "never clobber an existing filing"
 * property is a database one and runs against a real DB, skipping gracefully
 * without DATABASE_URL.
 */

describe("last closed period (pure)", () => {
  it("is the previous month", () => {
    expect(lastClosedPeriod(new Date("2026-08-21T09:00:00Z"))).toEqual({ year: 2026, month: 7 });
  });

  it("rolls back across the year boundary", () => {
    expect(lastClosedPeriod(new Date("2026-01-03T00:00:00Z"))).toEqual({ year: 2025, month: 12 });
  });
});

describe("close report copy exists in both locales", () => {
  for (const locale of ["es", "en"] as const) {
    it(`${locale} has a subject and a body`, () => {
      const dict = getDict(locale);
      for (const part of ["subject", "body"]) {
        const key = `notifications.close_report.${part}`;
        expect(translate(dict, key)).not.toBe(key);
      }
    });
  }
});

const prisma = new PrismaClient();
let dbAvailable = false;
let companyId = "";

const RUC = "90000034";

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
      razonSocial: "Test Precompute SA",
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

beforeEach(async () => {
  if (dbAvailable) await prisma.taxFiling.deleteMany({ where: { companyId } });
});

afterAll(async () => {
  if (dbAvailable && companyId) {
    await prisma.taxFiling.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  }
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DATABASE_URL)("month-end draft pre-computation (database)", () => {
  it("writes a DRAFT filing with the period's figures and its due date", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const res = await precomputeMonthEndDrafts(new Date("2026-08-01T03:00:00Z"), { companyId });
    expect(res.computed).toBe(1);

    const filing = await prisma.taxFiling.findFirst({ where: { companyId, year: 2026, month: 7 } });
    expect(filing?.status).toBe("DRAFT");
    expect(filing?.closedBy).toBeNull();
    // RUC ends in 4 → perpetual calendar day 15 of the following month.
    expect(filing?.dueDate.toISOString().slice(0, 10)).toBe("2026-08-17"); // 15th is a Saturday
    expect((filing?.snapshot as { month: number }).month).toBe(7);
  });

  it("is idempotent — a second run leaves the existing draft alone", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const now = new Date("2026-08-01T03:00:00Z");
    await precomputeMonthEndDrafts(now, { companyId });
    const first = await prisma.taxFiling.findFirstOrThrow({
      where: { companyId, year: 2026, month: 7 },
    });

    await precomputeMonthEndDrafts(now, { companyId });
    const rows = await prisma.taxFiling.findMany({ where: { companyId, year: 2026, month: 7 } });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.id);
    expect(rows[0].updatedAt.getTime()).toBe(first.updatedAt.getTime());
  });

  it("never touches a period that was already closed or declared", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const closed = await prisma.taxFiling.create({
      data: {
        companyId,
        type: "IVA",
        year: 2026,
        month: 7,
        status: "SUBMITTED",
        dueDate: new Date("2026-08-17"),
        snapshot: { year: 2026, month: 7, aPagar: 777 },
        closedBy: "contador@example.com",
        closedAt: new Date("2026-08-02"),
        submittedAt: new Date("2026-08-05"),
      },
    });

    await precomputeMonthEndDrafts(new Date("2026-08-01T03:00:00Z"), { companyId });

    const after = await prisma.taxFiling.findUniqueOrThrow({ where: { id: closed.id } });
    expect(after.status).toBe("SUBMITTED");
    expect((after.snapshot as { aPagar: number }).aPagar).toBe(777);
  });
});
