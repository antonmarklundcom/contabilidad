import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Proves the `f120.closed.*` → `TaxFiling` data migration.
 *
 * It runs the REAL SQL shipped in the migration file rather than a
 * re-typed copy, so the thing under test is the thing that will run against
 * production. Requires a reachable DATABASE_URL; skips gracefully without one,
 * matching tests/sequence.test.ts.
 */
const prisma = new PrismaClient();
let dbAvailable = false;
let companyId = "";

/** The data-migration half of the migration file, after the banner comment. */
function dataMigrationSql(): string {
  const file = path.join(
    process.cwd(),
    "prisma/migrations/20260804094717_tax_filing/migration.sql"
  );
  const sql = readFileSync(file, "utf8");
  const marker = 'INSERT INTO "TaxFiling"';
  const start = sql.indexOf(marker);
  if (start === -1) throw new Error("data migration INSERT not found in migration.sql");
  return sql.slice(start);
}

// RUC ending in 4 → perpetual calendar day 15.
const RUC = "90000004";

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
      razonSocial: "Test Filing Migration SA",
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
    await prisma.taxFiling.deleteMany({ where: { companyId } });
    await prisma.setting.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  }
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DATABASE_URL)("f120.closed → TaxFiling data migration", () => {
  it("copies a legacy Setting close into TaxFiling without deleting the original", async () => {
    if (!dbAvailable) return;

    const legacy = {
      closedBy: "contador@example.com",
      closedAt: "2026-06-02T10:30:00.000Z",
      snapshot: { year: 2026, month: 5, aPagar: 1_250_000, saldoAFavor: 0 },
    };
    await prisma.setting.create({
      data: { companyId, key: "f120.closed.2026-05", value: JSON.stringify(legacy) },
    });

    await prisma.$executeRawUnsafe(dataMigrationSql());

    const filing = await prisma.taxFiling.findUnique({
      where: { companyId_type_year_month: { companyId, type: "IVA", year: 2026, month: 5 } },
    });
    expect(filing).not.toBeNull();
    expect(filing!.status).toBe("CLOSED");
    expect(filing!.closedBy).toBe("contador@example.com");
    expect(filing!.closedAt?.toISOString()).toBe("2026-06-02T10:30:00.000Z");
    expect(filing!.snapshot).toMatchObject({ year: 2026, month: 5, aPagar: 1_250_000 });

    // RUC ends in 4 → the 15th, in the month AFTER the period.
    expect(filing!.dueDate.toISOString().slice(0, 10)).toBe("2026-06-15");

    // COPY, not move: the original Setting row is untouched.
    const original = await prisma.setting.findUnique({
      where: { companyId_key: { companyId, key: "f120.closed.2026-05" } },
    });
    expect(original).not.toBeNull();
    expect(JSON.parse(original!.value)).toEqual(legacy);
  });

  it("is idempotent — re-running creates no duplicate and clobbers nothing", async () => {
    if (!dbAvailable) return;

    const before = await prisma.taxFiling.findUnique({
      where: { companyId_type_year_month: { companyId, type: "IVA", year: 2026, month: 5 } },
    });
    expect(before).not.toBeNull();

    // A status transition made after the first run must survive a re-run.
    await prisma.taxFiling.update({
      where: { id: before!.id },
      data: { status: "SUBMITTED", submittedAt: new Date("2026-06-10T00:00:00.000Z") },
    });

    await prisma.$executeRawUnsafe(dataMigrationSql());
    await prisma.$executeRawUnsafe(dataMigrationSql());

    const rows = await prisma.taxFiling.findMany({ where: { companyId, year: 2026, month: 5 } });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(before!.id);
    expect(rows[0].status).toBe("SUBMITTED");
  });

  it("rolls a December period into January of the next year", async () => {
    if (!dbAvailable) return;

    await prisma.setting.create({
      data: {
        companyId,
        key: "f120.closed.2025-12",
        value: JSON.stringify({
          closedBy: "contador@example.com",
          closedAt: "2026-01-05T00:00:00.000Z",
          snapshot: { year: 2025, month: 12 },
        }),
      },
    });

    await prisma.$executeRawUnsafe(dataMigrationSql());

    const filing = await prisma.taxFiling.findUnique({
      where: { companyId_type_year_month: { companyId, type: "IVA", year: 2025, month: 12 } },
    });
    expect(filing!.dueDate.toISOString().slice(0, 10)).toBe("2026-01-15");
  });

  it("ignores Setting rows that are not period closes", async () => {
    if (!dbAvailable) return;

    await prisma.setting.createMany({
      data: [
        { companyId, key: "f120.saldoAnterior.2026-05", value: "500000" },
        { companyId, key: "f120.closed.not-a-date", value: "{}" },
        { companyId, key: "some.other.setting", value: "hello" },
      ],
    });

    await prisma.$executeRawUnsafe(dataMigrationSql());

    const all = await prisma.taxFiling.findMany({ where: { companyId } });
    // Only the two real closes from the tests above.
    expect(all).toHaveLength(2);
  });

  it("survives a malformed close blob instead of aborting the migration", async () => {
    if (!dbAvailable) return;

    await prisma.setting.create({
      data: { companyId, key: "f120.closed.2026-07", value: "this is not json" },
    });

    // pg_input_is_valid filters it out; the statement must still succeed.
    await expect(prisma.$executeRawUnsafe(dataMigrationSql())).resolves.toBeDefined();

    const filing = await prisma.taxFiling.findUnique({
      where: { companyId_type_year_month: { companyId, type: "IVA", year: 2026, month: 7 } },
    });
    expect(filing).toBeNull();
  });
});
