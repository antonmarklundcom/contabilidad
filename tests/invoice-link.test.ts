import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_TTL_MINUTES,
  MAX_TTL_MINUTES,
  MIN_TTL_MINUTES,
  attachInvoiceToLink,
  claimLink,
  createInvoiceLink,
  expiryFrom,
  generateLinkToken,
  hashLinkToken,
  hashesMatch,
  linkTokenLooksValid,
  loadLink,
  resolveTtlMinutes,
} from "@/lib/invoice-link";

/**
 * One-time invoice links (PLAN Phase 8.1).
 *
 * These are the security properties, not the happy path: the token is never
 * recoverable from the database, the expiry is only ever the server's, and a
 * link redeems exactly once even under a concurrent double submit.
 *
 * The DB half needs a reachable DATABASE_URL and skips gracefully without
 * one, matching tests/sequence.test.ts.
 */
const prisma = new PrismaClient();
let dbAvailable = false;
let companyId = "";

beforeAll(async () => {
  // `hashLinkToken` refuses to run without a signing key, which is the point;
  // CI sets NEXTAUTH_SECRET, and this keeps a bare `vitest` run honest too.
  process.env.NEXTAUTH_SECRET ||= "test-not-a-real-secret";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    return;
  }
  const company = await prisma.company.create({
    data: {
      ruc: "90000404",
      dv: "1",
      razonSocial: "Test Invoice Link SA",
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
    await prisma.invoiceLink.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  }
  await prisma.$disconnect();
});

describe("token shape and hashing (pure)", () => {
  it("mints high-entropy, URL-safe, opaque tokens", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const token = generateLinkToken();
      expect(linkTokenLooksValid(token)).toBe(true);
      // base64url only: safe in a path segment without escaping.
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encodeURIComponent(token)).toBe(token);
      seen.add(token);
    }
    expect(seen.size).toBe(200);
  });

  it("carries no readable payload — nothing a client could edit", () => {
    const token = generateLinkToken();
    // Not a JWT: no segments, no decodable JSON, no timestamp inside.
    expect(token).not.toContain(".");
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    expect(() => JSON.parse(decoded)).toThrow();
  });

  it("rejects malformed tokens before touching the database", () => {
    for (const bad of ["", "short", "a".repeat(42), "a".repeat(44), "has spaces", "a/b+c"]) {
      expect(linkTokenLooksValid(bad)).toBe(false);
    }
  });

  it("hashes deterministically, and the hash does not reveal the token", () => {
    const token = generateLinkToken();
    const hash = hashLinkToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashLinkToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
    expect(hashLinkToken(generateLinkToken())).not.toBe(hash);
  });

  it("changes the hash when the signing key changes — a DB write cannot forge one", () => {
    const token = generateLinkToken();
    const original = process.env.INVOICE_LINK_SECRET;
    process.env.INVOICE_LINK_SECRET = "key-one";
    const a = hashLinkToken(token);
    process.env.INVOICE_LINK_SECRET = "key-two";
    const b = hashLinkToken(token);
    if (original === undefined) delete process.env.INVOICE_LINK_SECRET;
    else process.env.INVOICE_LINK_SECRET = original;
    expect(a).not.toBe(b);
  });

  it("compares hashes without leaking length or content by timing", () => {
    const h = hashLinkToken(generateLinkToken());
    expect(hashesMatch(h, h)).toBe(true);
    expect(hashesMatch(h, hashLinkToken(generateLinkToken()))).toBe(false);
    expect(hashesMatch(h, h.slice(0, 10))).toBe(false);
  });
});

describe("TTL resolution (pure)", () => {
  it("falls back to the default for anything unparseable — never to 'no expiry'", () => {
    for (const bad of [undefined, null, "", "abc", "0", "-10", "NaN", "Infinity"]) {
      expect(resolveTtlMinutes(bad)).toBe(DEFAULT_TTL_MINUTES);
    }
  });

  it("clamps both ends, so a typo cannot mint a month-long link", () => {
    expect(resolveTtlMinutes("1")).toBe(MIN_TTL_MINUTES);
    expect(resolveTtlMinutes("999999")).toBe(MAX_TTL_MINUTES);
    expect(resolveTtlMinutes("60")).toBe(60);
    expect(MAX_TTL_MINUTES).toBeLessThanOrEqual(24 * 60);
  });

  it("keeps the default short", () => {
    expect(DEFAULT_TTL_MINUTES).toBeLessThanOrEqual(60);
  });

  it("computes expiry from the given instant, not from the wall clock", () => {
    const base = new Date("2026-08-26T10:00:00.000Z");
    expect(expiryFrom(base, 30).toISOString()).toBe("2026-08-26T10:30:00.000Z");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("link lifecycle", () => {
  beforeEach(async () => {
    if (dbAvailable) await prisma.invoiceLink.deleteMany({ where: { companyId } });
  });

  const create = (ttlMinutes?: number) =>
    createInvoiceLink({ companyId, establecimiento: "001", punto: "001", ttlMinutes });

  it("stores only the hash — the token is not in the row", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const { link, token } = await create();
    const row = await prisma.invoiceLink.findUnique({ where: { id: link.id } });
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(token);
    expect(row!.tokenHash).toBe(hashLinkToken(token));
  });

  it("pins the scope at issue time", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const { link } = await create();
    expect(link.companyId).toBe(companyId);
    // Factura only: a nota de crédito needs an original document to point at.
    expect(link.tipoDocumento).toBe(1);
    expect(link.establecimiento).toBe("001");
    expect(link.punto).toBe("001");
    expect(link.moneda).toBe("PYG");
  });

  it("resolves a live token and refuses one that matches nothing", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const { token } = await create();
    expect((await loadLink(token))?.state).toBe("usable");
    // A well-formed token that was never issued is indistinguishable from a
    // typo: no oracle for guessing.
    expect(await loadLink(generateLinkToken())).toBeNull();
    expect(await loadLink("not-a-token")).toBeNull();
  });

  it("expires against the server clock, and the client has no say", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const { token, link } = await create();
    const afterExpiry = new Date(link.expiresAt.getTime() + 1000);
    expect((await loadLink(token, afterExpiry))?.state).toBe("expired");
    expect(await claimLink(token, afterExpiry)).toMatchObject({
      ok: false,
      reason: "expired",
    });
    // And it was not consumed by the failed attempt.
    expect((await prisma.invoiceLink.findUnique({ where: { id: link.id } }))!.usedAt).toBeNull();
  });

  it("treats the expiry instant itself as past", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const { token, link } = await create();
    expect((await loadLink(token, link.expiresAt))?.state).toBe("expired");
  });

  it("redeems exactly once", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const { token } = await create();
    const first = await claimLink(token);
    expect(first.ok).toBe(true);

    const second = await claimLink(token);
    expect(second).toMatchObject({ ok: false, reason: "redeemed" });
  });

  it("survives a concurrent double submit with exactly one winner", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const { token } = await create();
    // The check and the write are one statement, so this cannot both-succeed.
    const results = await Promise.all(Array.from({ length: 8 }, () => claimLink(token)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(7);
    for (const r of results.filter((r) => !r.ok)) {
      expect(r).toMatchObject({ reason: "redeemed" });
    }
  });

  it("keeps showing a redeemed link, so the emitter can still see their document", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const { token, link } = await create();
    await claimLink(token);
    const loaded = await loadLink(token);
    expect(loaded?.state).toBe("redeemed");

    // Still visible after expiry: expiry gates EMISSION, not the receipt.
    const afterExpiry = new Date(link.expiresAt.getTime() + 86_400_000);
    expect((await loadLink(token, afterExpiry))?.state).toBe("redeemed");
  });

  it("records which document a claimed link produced", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const { token, link } = await create();
    await claimLink(token);
    // Any id would do here; the FK is exercised by the DB-level flow.
    const row = await prisma.invoiceLink.findUnique({ where: { id: link.id } });
    expect(row!.usedAt).not.toBeNull();
    expect(row!.invoiceId).toBeNull();

    await expect(attachInvoiceToLink(link.id, "missing-invoice-id")).rejects.toBeTruthy();
  });

  it("honours a per-link TTL override, still clamped", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const now = Date.now();
    const { link } = await create(999_999);
    const minutes = Math.round((link.expiresAt.getTime() - now) / 60_000);
    expect(minutes).toBeLessThanOrEqual(MAX_TTL_MINUTES);
    expect(minutes).toBeGreaterThan(MAX_TTL_MINUTES - 2);
  });
});
