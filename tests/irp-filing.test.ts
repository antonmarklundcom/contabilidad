import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  closeAnnualFiling,
  reopenAnnualFiling,
  getAnnualFiling,
  getAnnualClose,
  getFiling,
  irpDueDateForCompany,
  listFilings,
} from "@/lib/tax/filing";
import { ANNUAL_MONTH } from "@/lib/tax/filing-period";
import { buildIrp, computeIrp, emptyLibroTotals, getIrpRegime, setIrpRegime } from "@/lib/irp";
import { closePeriod } from "@/lib/form120";
import type { Form120Data } from "@/lib/form120";
import type { IrpData } from "@/lib/irp";

/**
 * The annual IRP filing lifecycle (PLAN Phase 7.3) — the DB half.
 *
 * The point of these is that IRP reuses Phase 5's machinery rather than
 * growing a parallel one: the same table, the same immutability guard, the
 * same archive query, and the annual row living happily beside the twelve
 * monthly ones for the same year. Needs a reachable DATABASE_URL; skips
 * gracefully without one, matching tests/sequence.test.ts.
 */
const prisma = new PrismaClient();
let dbAvailable = false;
let companyId = "";

// RUC ending in 4 → perpetual calendar day 15.
const RUC = "90000204";

/** A real IrpData, with the tax overridden so each case is identifiable. */
function irpSnapshot(impuesto: number): IrpData {
  const base = computeIrp(2026, "RSP", emptyLibroTotals(), emptyLibroTotals(), {
    ventas: 0,
    compras: 0,
  });
  return { ...base, impuesto };
}

function f120Snapshot(): Form120Data {
  return { year: 2026, month: 5, aPagar: 1_000, saldoAFavor: 0 } as unknown as Form120Data;
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
      razonSocial: "Test IRP Filing SA",
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

describe.skipIf(!process.env.DATABASE_URL)("IRP annual filing lifecycle", () => {
  it("stores the annual return with the sentinel month and the March due date", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const result = await closeAnnualFiling(companyId, 2026, "contador@example.com", irpSnapshot(15_000_000));
    expect(result.ok).toBe(true);

    const filing = await getAnnualFiling(companyId, 2026);
    expect(filing).not.toBeNull();
    expect(filing!.type).toBe("IRP");
    expect(filing!.month).toBe(ANNUAL_MONTH);
    expect(filing!.status).toBe("CLOSED");
    // IRP falls due in March of the FOLLOWING year; RUC ends in 4 → the 15th.
    expect(filing!.dueDate.toISOString().slice(0, 10)).toBe("2027-03-15");
    expect(await irpDueDateForCompany(companyId, 2026)).toEqual(filing!.dueDate);
  });

  it("re-closing a still-open year rewrites the draft rather than duplicating it", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const again = await closeAnnualFiling(companyId, 2026, "otro@example.com", irpSnapshot(9_000_000));
    expect(again.ok).toBe(true);

    const rows = await prisma.taxFiling.findMany({
      where: { companyId, type: "IRP", year: 2026 },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].closedBy).toBe("otro@example.com");
    expect((rows[0].snapshot as unknown as IrpData).impuesto).toBe(9_000_000);
  });

  it("lives beside the monthly filings for the same year without colliding", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const monthly = await closePeriod(companyId, 2026, 5, "contador@example.com", f120Snapshot());
    expect(monthly.ok).toBe(true);

    // Same company, same year — different taxes, both present.
    expect(await getAnnualFiling(companyId, 2026)).not.toBeNull();
    expect(await getFiling(companyId, 2026, 5)).not.toBeNull();
    expect(await prisma.taxFiling.count({ where: { companyId, year: 2026 } })).toBe(2);
  });

  it("refuses to rewrite a declared annual snapshot", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const filing = await getAnnualFiling(companyId, 2026);
    await prisma.taxFiling.update({
      where: { id: filing!.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });

    const blocked = await closeAnnualFiling(companyId, 2026, "otro@example.com", irpSnapshot(1));
    expect(blocked).toMatchObject({ ok: false, reason: "locked", status: "SUBMITTED" });

    // And the declared figures are untouched.
    const after = await getAnnualFiling(companyId, 2026);
    expect((after!.snapshot as unknown as IrpData).impuesto).toBe(9_000_000);
    expect(after!.closedBy).toBe("otro@example.com");
  });

  it("refuses to withdraw a declared annual filing", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const blocked = await reopenAnnualFiling(companyId, 2026);
    expect(blocked).toMatchObject({ ok: false, reason: "locked", status: "SUBMITTED" });
    expect(await getAnnualFiling(companyId, 2026)).not.toBeNull();
  });

  it("withdraws a still-open annual filing, and only the annual one", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const filing = await getAnnualFiling(companyId, 2026);
    await prisma.taxFiling.update({ where: { id: filing!.id }, data: { status: "CLOSED" } });

    const reopened = await reopenAnnualFiling(companyId, 2026);
    expect(reopened).toMatchObject({ ok: true, deleted: 1 });
    expect(await getAnnualFiling(companyId, 2026)).toBeNull();
    // The monthly filing for the same year survives.
    expect(await getFiling(companyId, 2026, 5)).not.toBeNull();
  });

  it("withdrawing a year with no annual filing is a no-op, not a refusal", async (ctx) => {
    if (!dbAvailable) ctx.skip();
    expect(await reopenAnnualFiling(companyId, 2019)).toMatchObject({ ok: true, deleted: 0 });
  });

  it("hides a DRAFT annual snapshot from getAnnualClose, like the monthly close does", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    await closeAnnualFiling(companyId, 2025, "contador@example.com", irpSnapshot(500_000));
    const filing = await getAnnualFiling(companyId, 2025);
    await prisma.taxFiling.update({ where: { id: filing!.id }, data: { status: "DRAFT" } });

    expect(await getAnnualClose(companyId, 2025)).toBeNull();

    await prisma.taxFiling.update({ where: { id: filing!.id }, data: { status: "CLOSED" } });
    const close = await getAnnualClose(companyId, 2025);
    expect(close).not.toBeNull();
    expect(close!.closedBy).toBe("contador@example.com");
    expect(close!.snapshot.impuesto).toBe(500_000);
  });

  it("filters the archive by tax without losing the other one", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const all = await listFilings(companyId, {});
    const irpOnly = await listFilings(companyId, { type: "IRP" });
    const ivaOnly = await listFilings(companyId, { type: "IVA" });

    expect(all.count).toBe(irpOnly.count + ivaOnly.count);
    expect(irpOnly.rows.every((r) => r.type === "IRP")).toBe(true);
    expect(ivaOnly.rows.every((r) => r.type === "IVA")).toBe(true);
    // An unknown value is ignored rather than filtering everything away.
    expect((await listFilings(companyId, { type: "NOPE" })).count).toBe(all.count);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("IRP regime, stored not inferred", () => {
  it("starts unset — no regime is assumed for a taxpayer", async (ctx) => {
    if (!dbAvailable) ctx.skip();
    expect(await getIrpRegime(companyId)).toBeNull();
  });

  it("round-trips an explicitly declared regime", async (ctx) => {
    if (!dbAvailable) ctx.skip();
    await setIrpRegime(companyId, "RSP");
    expect(await getIrpRegime(companyId)).toBe("RSP");
    await setIrpRegime(companyId, "RGC");
    expect(await getIrpRegime(companyId)).toBe("RGC");
  });

  it("reads a corrupted stored value as unset rather than as a regime", async (ctx) => {
    if (!dbAvailable) ctx.skip();
    await prisma.setting.update({
      where: { companyId_key: { companyId, key: "irp.regime" } },
      data: { value: "IRE" },
    });
    expect(await getIrpRegime(companyId)).toBeNull();
  });
});

describe.skipIf(!process.env.DATABASE_URL)("buildIrp over an empty year", () => {
  it("returns zeroes and no movement rather than throwing", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const data = await buildIrp(companyId, 2019, "RSP");
    expect(data.year).toBe(2019);
    expect(data.ingresos.rentaBruta).toBe(0);
    expect(data.egresos.egresoDeducible).toBe(0);
    expect(data.rentaNetaImponible).toBe(0);
    expect(data.impuesto).toBe(0);
    expect(data.mesesConMovimiento).toEqual([]);
    expect(data.documentCounts).toEqual({ ventas: 0, compras: 0 });
    // Zero income is under the threshold, so no tax is due.
    expect(data.noIncidido).toBe(true);
  });
});
