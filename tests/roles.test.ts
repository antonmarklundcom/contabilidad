import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  ROLES,
  normalizeRole,
  can,
  canOpen,
  routeCapability,
  capabilitiesOf,
  type Role,
  type Capability,
} from "@/lib/roles";

/**
 * PLAN Phase 6.3 — role enforcement.
 *
 * `User.role` existed from the first migration and was never checked. These
 * are the deny paths: what each role may NOT do, and which paths bounce.
 * The table is pure so this needs no database and no session.
 */

const WRITE_CAPABILITIES: Capability[] = [
  "invoices:write",
  "invoices:emit",
  "catalog:write",
  "expenses:write",
  "documents:write",
  "taxes:close",
  "settings:write",
];

describe("normalizeRole", () => {
  it("keeps the three known roles", () => {
    for (const role of ROLES) expect(normalizeRole(role)).toBe(role);
  });

  it("falls back to the most restricted role, never the most privileged", () => {
    for (const value of [null, undefined, "", "root", "ADMIN", "superuser"]) {
      expect(normalizeRole(value)).toBe("client");
    }
  });
});

describe("capabilities", () => {
  it("gives admin everything", () => {
    for (const capability of WRITE_CAPABILITIES) expect(can("admin", capability)).toBe(true);
  });

  it("denies the accountant company settings, and nothing else", () => {
    const denied = WRITE_CAPABILITIES.filter((c) => !can("accountant", c));
    expect(denied).toEqual(["settings:write"]);
  });

  it("lets the client contribute receipts and documents only", () => {
    expect([...capabilitiesOf("client")].sort()).toEqual([
      "documents:write",
      "expenses:write",
      "read",
    ]);
  });

  it("denies the client emission, the period close and settings", () => {
    for (const capability of [
      "invoices:write",
      "invoices:emit",
      "catalog:write",
      "taxes:close",
      "settings:write",
    ] as Capability[]) {
      expect(can("client", capability)).toBe(false);
    }
  });

  it("gives every role read", () => {
    for (const role of ROLES) expect(can(role, "read")).toBe(true);
  });
});

describe("route gating", () => {
  it("requires settings:write for the settings pages and API", () => {
    expect(routeCapability("/settings")).toBe("settings:write");
    expect(routeCapability("/settings/anything")).toBe("settings:write");
    expect(routeCapability("/api/settings/certificate")).toBe("settings:write");
  });

  it("gates the pages that change something, not the ones that show it", () => {
    expect(routeCapability("/invoices/new")).toBe("invoices:write");
    expect(routeCapability("/invoices/abc123/edit")).toBe("invoices:write");
    // A client owns the company's data and may read it.
    expect(routeCapability("/invoices")).toBeNull();
    expect(routeCapability("/invoices/abc123")).toBeNull();
    expect(routeCapability("/books")).toBeNull();
    expect(routeCapability("/reports")).toBeNull();
    expect(routeCapability("/documents")).toBeNull();
    expect(routeCapability("/")).toBeNull();
  });

  it("gates the tax pages and the filing endpoints", () => {
    expect(routeCapability("/taxes")).toBe("taxes:close");
    expect(routeCapability("/taxes/historial/abc")).toBe("taxes:close");
    expect(routeCapability("/api/filings/abc/pdf")).toBe("taxes:close");
    expect(routeCapability("/api/export/form120")).toBe("taxes:close");
  });

  it("does not gate a path that merely starts with a gated word", () => {
    expect(routeCapability("/settingsx")).toBeNull();
    expect(routeCapability("/invoices/newest")).toBeNull();
  });

  it("bounces a client off the pages it may not open", () => {
    for (const path of ["/settings", "/taxes", "/invoices/new", "/invoices/x/edit"]) {
      expect(canOpen("client", path)).toBe(false);
      expect(canOpen("admin", path)).toBe(true);
    }
    expect(canOpen("accountant", "/taxes")).toBe(true);
    expect(canOpen("accountant", "/settings")).toBe(false);
  });

  it("lets every role reach the pages that are only read", () => {
    for (const role of ROLES as readonly Role[]) {
      for (const path of ["/", "/invoices", "/expenses", "/documents", "/books"]) {
        expect(canOpen(role, path)).toBe(true);
      }
    }
  });
});

/**
 * Structural guard: the point of Phase 6.3 is that the route check is NOT the
 * boundary — every mutating server action has to check for itself, because a
 * server action is a POST endpoint any session can call directly. A new action
 * that forgets the check fails here rather than in production.
 */
describe("every mutating server action checks a capability", () => {
  /** Every `actions.ts` under src/app, found by walking rather than globbing. */
  function findActionFiles(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) found.push(...findActionFiles(full));
      else if (entry.name === "actions.ts") found.push(full);
    }
    return found;
  }

  const actionFiles = findActionFiles("src/app");

  /** Reads only; a capability check would be wrong, not missing. */
  const READ_ONLY = new Set([
    "canCancelInvoice",
    "categoryForSupplier",
    // A user changing their OWN password needs no capability: it is not a
    // company setting, and the session identifies whose password it is.
    "changePassword",
  ]);

  it("finds the action files", () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(6);
  });

  for (const file of actionFiles) {
    it(`${file} guards its mutations`, () => {
      const source = readFileSync(file, "utf8");
      const chunks = source.split("export async function ").slice(1);
      for (const chunk of chunks) {
        const name = chunk.slice(0, chunk.indexOf("(")).trim();
        if (READ_ONLY.has(name)) continue;
        expect(
          chunk.includes('allowed("'),
          `${name} in ${file} does not check a capability`
        ).toBe(true);
      }
    });
  }
});
