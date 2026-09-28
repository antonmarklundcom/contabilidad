import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  buildReviewQueue,
  classifyExpense,
  deadlineNeedsAttention,
  type ExpenseForQueue,
} from "@/lib/review-queue";
import { can, routeCapability } from "@/lib/roles";

/** PLAN Phase 12 — the cross-client exception queue. */
const base: ExpenseForQueue = { status: "NEEDS_REVIEW", duplicateOfId: null, cdcVerdict: null, confidence: null };

describe("classifyExpense", () => {
  it("a confirmed, clean expense needs nobody", () => {
    expect(classifyExpense({ ...base, status: "CONFIRMED" }, { active: true })).toEqual([]);
  });

  it("orders reasons most serious first", () => {
    expect(
      classifyExpense(
        { ...base, cdcVerdict: "mismatch", duplicateOfId: "x", confidence: { total: 0.5, ruc: 0.99 } },
        { active: false }
      )
    ).toEqual(["CDC_MISMATCH", "INACTIVE_SUPPLIER", "DUPLICATE_SUSPECT", "LOW_CONFIDENCE", "NEEDS_REVIEW"]);
  });

  it("flags an inactive supplier only before review", () => {
    expect(classifyExpense(base, { active: false })).toContain("INACTIVE_SUPPLIER");
    expect(classifyExpense({ ...base, status: "CONFIRMED" }, { active: false })).toEqual([]);
  });

  it("does not invent a padrón verdict when the supplier is unknown", () => {
    expect(classifyExpense(base, undefined)).toEqual(["NEEDS_REVIEW"]);
  });

  it("keeps a confirmed CDC mismatch or duplicate in the queue", () => {
    expect(classifyExpense({ ...base, status: "CONFIRMED", cdcVerdict: "rejected" }, undefined)).toEqual([
      "CDC_MISMATCH",
    ]);
    expect(classifyExpense({ ...base, status: "CONFIRMED", duplicateOfId: "d" }, undefined)).toEqual([
      "DUPLICATE_SUSPECT",
    ]);
  });

  it("ignores confidence values that are not numbers", () => {
    expect(classifyExpense({ ...base, confidence: { total: "high" } }, undefined)).toEqual(["NEEDS_REVIEW"]);
  });
});

describe("deadlineNeedsAttention", () => {
  it("overdue or within ten days", () => {
    expect(deadlineNeedsAttention(null)).toBe(false);
    expect(deadlineNeedsAttention({ overdue: true, daysRemaining: -3 })).toBe(true);
    expect(deadlineNeedsAttention({ overdue: false, daysRemaining: 10 })).toBe(true);
    expect(deadlineNeedsAttention({ overdue: false, daysRemaining: 11 })).toBe(false);
  });
});

describe("queue access", () => {
  it("is for accountants and admins, not clients", () => {
    expect(routeCapability("/queue")).toBe("queue:read");
    expect(can("admin", "queue:read")).toBe(true);
    expect(can("accountant", "queue:read")).toBe(true);
    expect(can("client", "queue:read")).toBe(false);
  });
});

/* ── DB-backed: membership scoping ──────────────────────────────────────── */

const prisma = new PrismaClient();
let db = false;
const created: { users: string[]; companies: string[] } = { users: [], companies: [] };

async function company(ruc: string, name: string) {
  const c = await prisma.company.create({
    data: {
      ruc,
      dv: "1",
      razonSocial: name,
      actividades: [],
      timbradoNumero: "12345678",
      timbradoFechaInicio: new Date("2026-01-01"),
      direccion: "Calle 1",
      departamento: 11,
      departamentoDescripcion: "CENTRAL",
      distrito: 1,
      distritoDescripcion: "ASUNCION",
      ciudad: 1,
      ciudadDescripcion: "ASUNCION",
    },
  });
  created.companies.push(c.id);
  return c.id;
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "Membership" LIMIT 1`;
    db = true;
  } catch {
    db = false;
  }
});

afterAll(async () => {
  if (db) {
    await prisma.expense.deleteMany({ where: { companyId: { in: created.companies } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    await prisma.company.deleteMany({ where: { id: { in: created.companies } } });
  }
  await prisma.$disconnect();
});

describe("buildReviewQueue", () => {
  it("covers every member company and nothing else", async (ctx) => {
    if (!db) ctx.skip();
    const a = await company("91000001", "Cliente A");
    const b = await company("91000002", "Cliente B");
    const other = await company("91000003", "Ajeno");
    const user = await prisma.user.create({
      data: {
        email: `queue-${Date.now()}@test.example`,
        passwordHash: "x",
        name: "Contadora",
        role: "accountant",
        companyId: a,
        memberships: { create: [{ companyId: a }, { companyId: b }] },
      },
    });
    created.users.push(user.id);
    const exp = { source: "MANUAL" as const, total: 1000, fecha: new Date(Date.UTC(2026, 8, 1)) };
    await prisma.expense.createMany({
      data: [
        { ...exp, companyId: a, status: "NEEDS_REVIEW", numeroComprobante: "A-1" },
        { ...exp, companyId: a, status: "CONFIRMED", numeroComprobante: "A-2" },
        { ...exp, companyId: b, status: "CONFIRMED", numeroComprobante: "B-1", cdcVerdict: "mismatch" },
        { ...exp, companyId: other, status: "NEEDS_REVIEW", numeroComprobante: "X-1" },
      ],
    });

    const { items, board } = await buildReviewQueue(user.id, new Date(Date.UTC(2026, 8, 28)));
    expect(items.map((i) => i.numeroComprobante)).toEqual(["B-1", "A-1"]);
    expect(items.every((i) => i.companyId !== other)).toBe(true);
    expect(board.map((r) => r.companyName).sort()).toEqual(["Cliente A", "Cliente B"]);
    expect(board.find((r) => r.companyId === a)?.openItems).toBe(1);
  });
});
