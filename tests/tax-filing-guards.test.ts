import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  MUTABLE_FILING_STATUSES,
  canReopenFiling,
  canOverwriteSnapshot,
  type FilingStatus,
} from "@/lib/tax/filing-status";
import { closePeriod, reopenPeriod } from "@/lib/tax/filing";
import type { Form120Data } from "@/lib/form120";

/**
 * PLAN Phase 5.10 — filing status guards.
 *
 * Snapshot immutability used to be UI-enforced only: `reopenPeriod()` was an
 * unguarded delete and `closePeriod()` an unguarded upsert, so a SUBMITTED or
 * PAID declaration could be destroyed or rewritten. These are the deny paths.
 *
 * The pure half runs everywhere; the DB half needs a reachable DATABASE_URL
 * and skips gracefully without one, matching tests/sequence.test.ts.
 */

const ALL_STATUSES: FilingStatus[] = ["DRAFT", "CLOSED", "SUBMITTED", "PAID"];

describe("filing status guards (pure)", () => {
  it("allows reopening only from DRAFT and CLOSED", () => {
    expect(ALL_STATUSES.filter(canReopenFiling)).toEqual(["DRAFT", "CLOSED"]);
  });

  it("allows overwriting a snapshot only from DRAFT and CLOSED", () => {
    expect(ALL_STATUSES.filter(canOverwriteSnapshot)).toEqual(["DRAFT", "CLOSED"]);
  });

  it("refuses a declared filing in both directions", () => {
    for (const status of ["SUBMITTED", "PAID"] as FilingStatus[]) {
      expect(canReopenFiling(status)).toBe(false);
      expect(canOverwriteSnapshot(status)).toBe(false);
    }
  });

  it("keeps the mutable set to the two working states", () => {
    expect([...MUTABLE_FILING_STATUSES]).toEqual(["DRAFT", "CLOSED"]);
  });
});

const prisma = new PrismaClient();
let dbAvailable = false;
let companyId = "";

// RUC ending in 4 → perpetual calendar day 15.
const RUC = "90000014";

function snapshot(aPagar: number): Form120Data {
  return { year: 2026, month: 5, aPagar, saldoAFavor: 0 } as unknown as Form120Data;
}

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
      razonSocial: "Test Filing Guards SA",
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
    await prisma.company.delete({ where: { id: companyId } });
  }
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DATABASE_URL)("filing status guards (database)", () => {
  it("closes, re-closes and reopens while the period is a working state", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const first = await closePeriod(companyId, 2026, 1, "contador@example.com", snapshot(1000));
    expect(first.ok).toBe(true);

    // Re-closing a CLOSED period re-freezes it with the current figures.
    const second = await closePeriod(companyId, 2026, 1, "contador@example.com", snapshot(2000));
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.filing.status).toBe("CLOSED");
      expect((second.filing.snapshot as { aPagar: number }).aPagar).toBe(2000);
    }

    const reopened = await reopenPeriod(companyId, 2026, 1);
    expect(reopened).toEqual({ ok: true, deleted: 1 });
    expect(await prisma.taxFiling.count({ where: { companyId, year: 2026, month: 1 } })).toBe(0);
  });

  it("refuses to reopen a SUBMITTED filing and leaves it intact", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    await closePeriod(companyId, 2026, 2, "contador@example.com", snapshot(3000));
    await prisma.taxFiling.updateMany({
      where: { companyId, year: 2026, month: 2 },
      data: { status: "SUBMITTED", submittedAt: new Date("2026-03-10") },
    });

    const res = await reopenPeriod(companyId, 2026, 2);
    expect(res).toMatchObject({ ok: false, reason: "locked", status: "SUBMITTED" });

    const still = await prisma.taxFiling.findFirst({ where: { companyId, year: 2026, month: 2 } });
    expect(still?.status).toBe("SUBMITTED");
    expect((still?.snapshot as { aPagar: number }).aPagar).toBe(3000);
  });

  it("refuses to overwrite the snapshot of a PAID filing", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    await closePeriod(companyId, 2026, 3, "contador@example.com", snapshot(4000));
    await prisma.taxFiling.updateMany({
      where: { companyId, year: 2026, month: 3 },
      data: { status: "PAID", paidAt: new Date("2026-04-10") },
    });

    const res = await closePeriod(companyId, 2026, 3, "otro@example.com", snapshot(9999));
    expect(res).toMatchObject({ ok: false, reason: "locked", status: "PAID" });

    const still = await prisma.taxFiling.findFirst({ where: { companyId, year: 2026, month: 3 } });
    expect(still?.status).toBe("PAID");
    expect((still?.snapshot as { aPagar: number }).aPagar).toBe(4000);
    expect(still?.closedBy).toBe("contador@example.com");
  });

  it("treats a period with no filing as a no-op reopen, not a refusal", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    expect(await reopenPeriod(companyId, 2026, 11)).toEqual({ ok: true, deleted: 0 });
  });
});
