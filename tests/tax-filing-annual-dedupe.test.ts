import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ANNUAL_MONTH,
  isAnnualPeriod,
  monthColumn,
  periodLabel,
  periodMonth,
} from "@/lib/tax/filing-period";

/**
 * Regression test for the annual-filing dedupe bug.
 *
 * `TaxFiling` is unique on `(companyId, type, year, month)`. While `month` was
 * nullable that constraint deduped monthly filings and did NOTHING for annual
 * ones, because Postgres treats NULLs as distinct — two IRP returns for the
 * same company and fiscal year would both insert. Phase 7 is the first code
 * that writes IRP rows, so this had to be fixed before it, not after.
 *
 * The DB half requires a reachable DATABASE_URL and skips gracefully without
 * one, matching tests/sequence.test.ts and tests/tax-filing-migration.test.ts.
 */
const prisma = new PrismaClient();
let dbAvailable = false;
let companyId = "";
let otherCompanyId = "";

/** The data-migration half of the shipped migration, run as-is. */
function sentinelMigrationSql(): string {
  const file = path.join(
    process.cwd(),
    "prisma/migrations/20260826094302_taxfiling_annual_month_sentinel/migration.sql"
  );
  const sql = readFileSync(file, "utf8");
  const marker = 'UPDATE "TaxFiling"';
  const start = sql.indexOf(marker);
  if (start === -1) throw new Error("data migration UPDATE not found in migration.sql");
  // Stop before the ALTER TABLE: the column is already NOT NULL by then, and
  // re-running a shape change is not what idempotence means here.
  const end = sql.indexOf("ALTER TABLE", start);
  return sql.slice(start, end === -1 ? undefined : end);
}

async function makeCompany(ruc: string, name: string): Promise<string> {
  const company = await prisma.company.create({
    data: {
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
    },
  });
  return company.id;
}

/** A filing row with the fields the constraint cares about. */
function annualFiling(company: string, year: number) {
  return {
    companyId: company,
    type: "IRP" as const,
    year,
    month: ANNUAL_MONTH,
    status: "DRAFT" as const,
    dueDate: new Date(Date.UTC(year + 1, 2, 9)),
    snapshot: {} as Prisma.InputJsonValue,
  };
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    return;
  }
  companyId = await makeCompany("90000101", "Test Annual Dedupe SA");
  otherCompanyId = await makeCompany("90000102", "Test Annual Dedupe Dos SA");
});

afterAll(async () => {
  if (dbAvailable) {
    for (const id of [companyId, otherCompanyId].filter(Boolean)) {
      await prisma.taxFiling.deleteMany({ where: { companyId: id } });
      await prisma.company.delete({ where: { id } });
    }
  }
  await prisma.$disconnect();
});

describe("filing-period (pure)", () => {
  it("uses a sentinel no real month can take", () => {
    expect(ANNUAL_MONTH).toBe(0);
    for (let m = 1; m <= 12; m++) expect(isAnnualPeriod(m)).toBe(false);
    expect(isAnnualPeriod(ANNUAL_MONTH)).toBe(true);
  });

  it("round-trips a month through the column and back", () => {
    for (let m = 1; m <= 12; m++) {
      expect(monthColumn(m)).toBe(m);
      expect(periodMonth(monthColumn(m))).toBe(m);
    }
  });

  it("maps every 'no month' shape onto the sentinel, and back to null", () => {
    expect(monthColumn(null)).toBe(ANNUAL_MONTH);
    expect(monthColumn(undefined)).toBe(ANNUAL_MONTH);
    expect(periodMonth(ANNUAL_MONTH)).toBeNull();
  });

  it("labels a month period and a fiscal year differently", () => {
    expect(periodLabel(2026, 5)).toBe("2026-05");
    expect(periodLabel(2026, 12)).toBe("2026-12");
    expect(periodLabel(2026, ANNUAL_MONTH)).toBe("2026");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("TaxFiling annual dedupe", () => {
  it("refuses a second annual filing for the same company, type and year", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const first = await prisma.taxFiling.create({ data: annualFiling(companyId, 2026) });
    expect(first.month).toBe(ANNUAL_MONTH);

    // The bug: before the sentinel this second insert SUCCEEDED, leaving two
    // annual returns for 2026 behind.
    await expect(
      prisma.taxFiling.create({ data: annualFiling(companyId, 2026) })
    ).rejects.toMatchObject({ code: "P2002" });

    const rows = await prisma.taxFiling.findMany({
      where: { companyId, type: "IRP", year: 2026 },
    });
    expect(rows).toHaveLength(1);
  });

  it("still allows a different year, a different type and a different company", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    await prisma.taxFiling.create({ data: annualFiling(companyId, 2025) });
    await prisma.taxFiling.create({
      data: { ...annualFiling(companyId, 2026), type: "IVA" },
    });
    await prisma.taxFiling.create({ data: annualFiling(otherCompanyId, 2026) });

    expect(await prisma.taxFiling.count({ where: { companyId } })).toBe(3);
    expect(await prisma.taxFiling.count({ where: { companyId: otherCompanyId } })).toBe(1);
  });

  it("makes an annual filing reachable by the same unique lookup as a monthly one", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const found = await prisma.taxFiling.findUnique({
      where: {
        companyId_type_year_month: {
          companyId,
          type: "IRP",
          year: 2026,
          month: ANNUAL_MONTH,
        },
      },
    });
    expect(found).not.toBeNull();
    expect(periodLabel(found!.year, found!.month)).toBe("2026");
  });

  it("runs the shipped data migration idempotently over rows that already have a month", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const before = await prisma.taxFiling.findMany({
      where: { companyId },
      orderBy: [{ type: "asc" }, { year: "asc" }],
    });

    await prisma.$executeRawUnsafe(sentinelMigrationSql());
    await prisma.$executeRawUnsafe(sentinelMigrationSql());

    const after = await prisma.taxFiling.findMany({
      where: { companyId },
      orderBy: [{ type: "asc" }, { year: "asc" }],
    });
    expect(after.map((f) => [f.id, f.type, f.year, f.month])).toEqual(
      before.map((f) => [f.id, f.type, f.year, f.month])
    );
  });
});
