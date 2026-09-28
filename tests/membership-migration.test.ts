import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { prisma } from "@/lib/prisma";

/**
 * PLAN Phase 0.4 — the membership backfill must give every existing user a
 * membership in their default company, and replaying it must be harmless.
 * Executes the shipped SQL itself, like tax-filing-migration.test.ts.
 */
const dir = readdirSync("prisma/migrations").find((d) => d.endsWith("_membership"))!;
const sql = readFileSync(`prisma/migrations/${dir}/migration.sql`, "utf8");
const backfill = sql.slice(sql.indexOf("INSERT INTO \"Membership\""));

let dbReady = false;
beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "Membership" LIMIT 1`;
    dbReady = true;
  } catch {
    dbReady = false;
  }
});

describe("membership backfill", () => {
  it("is idempotent and covers users with a default company", async (ctx) => {
    if (!dbReady) ctx.skip();
    const company = await prisma.company.create({
      data: {
        ruc: "80099901",
        dv: "1",
        razonSocial: "Membership test",
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
    const email = `mb-${Date.now()}@test.example`;
    const user = await prisma.user.create({
      data: { email, passwordHash: "x", name: "MB", companyId: company.id },
    });
    try {
      await prisma.$executeRawUnsafe(backfill);
      await prisma.$executeRawUnsafe(backfill);
      const rows = await prisma.membership.findMany({ where: { userId: user.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].companyId).toBe(company.id);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.company.delete({ where: { id: company.id } });
    }
  });
});
