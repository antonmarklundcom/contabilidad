import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { nextDocumentNumber } from "@/lib/sequences";

/**
 * Concurrency test for the document sequence. It requires a reachable
 * DATABASE_URL; if the DB is unavailable the test is skipped rather than
 * failing (CI without a DB still passes the money-critical unit tests).
 */
const prisma = new PrismaClient();
let dbAvailable = false;
let companyId = "";
let pointId = "";

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
      ruc: "90000000",
      dv: "0",
      razonSocial: "SEQ TEST CO",
      actividades: [],
      timbradoNumero: "1",
      timbradoFechaInicio: new Date(),
      direccion: "x",
      departamento: 1,
      departamentoDescripcion: "x",
      distrito: 1,
      distritoDescripcion: "x",
      ciudad: 1,
      ciudadDescripcion: "x",
    },
  });
  companyId = company.id;
  const est = await prisma.establishment.create({
    data: { companyId, codigo: "009" },
  });
  const point = await prisma.expeditionPoint.create({
    data: { companyId, establishmentId: est.id, codigo: "009" },
  });
  pointId = point.id;
  await prisma.documentSequence.create({
    data: { companyId, expeditionPointId: pointId, tipoDocumento: 1, currentNumber: 0 },
  });
});

afterAll(async () => {
  if (dbAvailable && companyId) {
    await prisma.documentSequence.deleteMany({ where: { companyId } });
    await prisma.expeditionPoint.deleteMany({ where: { companyId } });
    await prisma.establishment.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  }
  await prisma.$disconnect();
});

describe("document sequence under concurrency", () => {
  it("assigns unique, gapless numbers when called in parallel", async (ctx) => {
    if (!dbAvailable) ctx.skip();
    const N = 50;
    const results = await Promise.all(
      Array.from({ length: N }, () => nextDocumentNumber(pointId, 1))
    );
    const numbers = results.map((r) => Number(r));
    const unique = new Set(numbers);
    expect(unique.size).toBe(N); // no duplicates
    expect(Math.min(...numbers)).toBe(1);
    expect(Math.max(...numbers)).toBe(N); // gapless 1..N
    // All 7-digit padded
    for (const r of results) expect(r).toHaveLength(7);
  });
});
