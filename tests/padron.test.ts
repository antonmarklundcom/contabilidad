import { describe, it, expect, beforeAll, afterAll } from "vitest";
import JSZip from "jszip";
import { PrismaClient } from "@prisma/client";
import { calcularDigitoVerificador } from "@/lib/sifen/ruc";
import {
  assertPlausible,
  decodePadron,
  isActiveEstado,
  lookupSuppliers,
  normalizeRuc,
  padronSyncDue,
  parsePadronLine,
  parsePadronText,
  parsePadronZip,
  syncPadron,
} from "@/lib/padron";
import { buildReconciliation } from "@/lib/reconcile";

/**
 * PLAN Phase 10. Lines are built with a REAL check digit so the parser's
 * DV self-check is exercised rather than bypassed.
 */
const line = (ruc: string, name: string, estado: string, dv?: string) =>
  `${ruc}|${name}|${dv ?? calcularDigitoVerificador(ruc)}|OLD${ruc}|${estado}|`;

describe("padrón parsing", () => {
  it("parses a valid line", () => {
    expect(parsePadronLine(line("80012345", "EMPRESA SA", "ACTIVO"))).toEqual({
      ruc: "80012345",
      dv: String(calcularDigitoVerificador("80012345")),
      razonSocial: "EMPRESA SA",
      rucAnterior: "OLD80012345",
      estado: "ACTIVO",
    });
  });

  it("rejects a line whose DV does not check — the format self-test", () => {
    const good = String(calcularDigitoVerificador("80012345"));
    const bad = String((Number(good) + 1) % 10);
    expect(parsePadronLine(line("80012345", "X", "ACTIVO", bad))).toBeNull();
    expect(parsePadronLine("garbage")).toBeNull();
  });

  it("refuses a file that mostly fails, as a wrong format", () => {
    // Columns swapped: name where the DV should be.
    const swapped = Array.from({ length: 50 }, (_, i) => `${1000 + i}|1|NAME|x|ACTIVO|`).join("\n");
    expect(() => assertPlausible(parsePadronText(swapped), "ruc0.zip")).toThrow(/wrong format/);
  });

  it("tolerates a stray bad row in a large good file", () => {
    const rows = Array.from({ length: 100 }, (_, i) => line(String(2000000 + i), "N", "ACTIVO"));
    rows.push("broken line");
    expect(() => assertPlausible(parsePadronText(rows.join("\n")), "f")).not.toThrow();
  });

  it("only ACTIVO is active", () => {
    expect(isActiveEstado("ACTIVO")).toBe(true);
    expect(isActiveEstado(" activo ")).toBe(true);
    for (const e of ["SUSPENSION TEMPORAL", "BLOQUEADO", "CANCELADO", "CANCELADO DEFINITIVO"]) {
      expect(isActiveEstado(e)).toBe(false);
    }
  });

  it("normalizes RUCs the way the padrón keys them", () => {
    expect(normalizeRuc("0080012345")).toBe("80012345");
    expect(normalizeRuc("80.012.345")).toBe("80012345");
    expect(normalizeRuc(null)).toBe("");
  });

  it("decodes Latin-1 files", () => {
    const latin1 = new Uint8Array([0x4e, 0xd1, 0x41]); // "NÑA" in Latin-1
    expect(decodePadron(latin1)).toBe("NÑA");
  });

  it("reads the .txt inside a zip", async () => {
    const zip = new JSZip();
    zip.file("ruc3.txt", [line("3000001", "ANA", "ACTIVO"), line("3000002", "LUIS", "CANCELADO")].join("\r\n"));
    const parsed = await parsePadronZip(await zip.generateAsync({ type: "uint8array" }), "ruc3.zip");
    expect(parsed.rows.map((r) => r.estado)).toEqual(["ACTIVO", "CANCELADO"]);
  });
});

describe("padronSyncDue", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
  const base = { configured: true, lastOkAt: null, lastAttemptAt: null, pending: false, now };
  it("never runs unconfigured or while pending", () => {
    expect(padronSyncDue({ ...base, configured: false })).toBe(false);
    expect(padronSyncDue({ ...base, pending: true })).toBe(false);
  });
  it("runs first time, then monthly", () => {
    expect(padronSyncDue(base)).toBe(true);
    expect(padronSyncDue({ ...base, lastOkAt: daysAgo(10), lastAttemptAt: daysAgo(10) })).toBe(false);
    expect(padronSyncDue({ ...base, lastOkAt: daysAgo(31), lastAttemptAt: daysAgo(31) })).toBe(true);
  });
  it("backs off a day after a failed attempt", () => {
    expect(padronSyncDue({ ...base, lastAttemptAt: new Date(now.getTime() - 3600000) })).toBe(false);
    expect(padronSyncDue({ ...base, lastAttemptAt: daysAgo(2) })).toBe(true);
  });
});

/* ── DB-backed: the sync and the reconciliation disclosure ──────────────── */

const prisma = new PrismaClient();
let db = false;
let companyId = "";
const ACTIVE = "4400001";
const CANCELLED = "4400002";

async function zipFor(d: number): Promise<Uint8Array> {
  const zip = new JSZip();
  const rows =
    d === 4
      ? [line(ACTIVE, "PROVEEDOR ACTIVO", "ACTIVO"), line(CANCELLED, "PROVEEDOR CANCELADO", "CANCELADO")]
      : [line(`9${d}00001`, "OTRO", "ACTIVO")];
  zip.file(`ruc${d}.txt`, rows.join("\n"));
  return zip.generateAsync({ type: "uint8array" });
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "DnitPadron" LIMIT 1`;
    db = true;
  } catch {
    return;
  }
  const c = await prisma.company.create({
    data: {
      ruc: "90000077",
      dv: "1",
      razonSocial: "Padrón test",
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
  companyId = c.id;
  const base = { companyId, source: "MANUAL" as const, status: "CONFIRMED" as const, total: 110000, iva10: 10000, gravada10: 100000 };
  await prisma.expense.createMany({
    data: [
      { ...base, supplierRuc: ACTIVE, numeroComprobante: "001-001-0000001", fecha: new Date(Date.UTC(2026, 5, 3)) },
      { ...base, supplierRuc: CANCELLED, numeroComprobante: "001-001-0000002", fecha: new Date(Date.UTC(2026, 5, 4)) },
    ],
  });
});

afterAll(async () => {
  if (!db) return;
  await prisma.expense.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.dnitPadron.deleteMany({ where: { ruc: { in: [ACTIVE, CANCELLED, ...Array.from({ length: 10 }, (_, d) => `9${d}00001`)] } } });
  await prisma.$disconnect();
});

describe("padrón sync + reconciliation", () => {
  it("records UNAVAILABLE and loads nothing without a base URL", async (ctx) => {
    if (!db) ctx.skip();
    const res = await syncPadron({ baseUrl: "" });
    expect(res.status).toBe("UNAVAILABLE");
  });

  it("loads nothing when one archive has the wrong format", async (ctx) => {
    if (!db) ctx.skip();
    const res = await syncPadron({
      baseUrl: "https://example.test",
      fetcher: async (url) => {
        if (url.endsWith("ruc7.zip")) {
          const z = new JSZip();
          z.file("ruc7.txt", "a|b|c|d|e|\nf|g|h|i|j|");
          return z.generateAsync({ type: "uint8array" });
        }
        return zipFor(Number(url.match(/ruc(\d)\.zip$/)![1]));
      },
    });
    expect(res.status).toBe("FAILED");
    expect(await prisma.dnitPadron.count({ where: { ruc: ACTIVE } })).toBe(0);
  });

  it("syncs, looks suppliers up, and discloses the inactive one without blocking the close", async (ctx) => {
    if (!db) ctx.skip();
    const res = await syncPadron({
      baseUrl: "https://example.test/",
      fetcher: async (url) => zipFor(Number(url.match(/ruc(\d)\.zip$/)![1])),
    });
    expect(res).toMatchObject({ status: "OK", rows: 11, rejected: 0 });

    const found = await lookupSuppliers([ACTIVE, `00${CANCELLED}`, "123"]);
    expect(found.get(ACTIVE)?.active).toBe(true);
    expect(found.get(CANCELLED)?.active).toBe(false);
    expect(found.has("123")).toBe(false);

    const rec = await buildReconciliation(companyId, 2026, 6);
    expect(rec.inactiveSuppliers.map((s) => [s.supplierRuc, s.estado])).toEqual([[CANCELLED, "CANCELADO"]]);
    expect(rec.clean).toBe(true);
  });
});
