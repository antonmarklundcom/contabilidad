/**
 * Roles and capabilities (PLAN Phase 6.3).
 *
 * `User.role` has existed since the first migration and was never checked.
 * This module is the single place that decides what a role may do; the
 * middleware uses it to gate routes and every mutating server action uses it
 * again, because a route check alone protects nothing — a server action is a
 * POST endpoint that anyone with a session can call directly.
 *
 * Pure and client-safe on purpose: no Prisma, no next-auth, so the deny paths
 * are testable without a database and the same table drives the UI.
 */

export type Role = "admin" | "accountant" | "client";

export const ROLES: readonly Role[] = ["admin", "accountant", "client"];

/** Unknown or missing roles fall back to the most restricted one. */
export function normalizeRole(value: string | null | undefined): Role {
  return (ROLES as readonly string[]).includes(value ?? "") ? (value as Role) : "client";
}

/**
 * What an action needs, not what a screen is called.
 *
 * `read` is every authenticated user; the rest are the things that change a
 * fiscal record, cost money, or reconfigure the company.
 */
export type Capability =
  | "read"
  | "invoices:write"
  | "invoices:emit"
  | "catalog:write"
  | "expenses:write"
  | "documents:write"
  | "taxes:close"
  | "settings:write";

const CAPABILITIES: Record<Role, readonly Capability[]> = {
  // The owner/operator: everything.
  admin: [
    "read",
    "invoices:write",
    "invoices:emit",
    "catalog:write",
    "expenses:write",
    "documents:write",
    "taxes:close",
    "settings:write",
  ],
  // The bookkeeper: does the work, but does not reconfigure the company
  // (certificate, timbrado, sequences, SMTP, passwords of others).
  accountant: [
    "read",
    "invoices:write",
    "invoices:emit",
    "catalog:write",
    "expenses:write",
    "documents:write",
    "taxes:close",
  ],
  // The client on the portal: reads their own company, and contributes the
  // two things only they have — receipts and documents. No emission, no
  // period close, no settings.
  client: ["read", "expenses:write", "documents:write"],
};

export function can(role: Role, capability: Capability): boolean {
  return CAPABILITIES[role].includes(capability);
}

/** Capabilities of a role, for the UI to hide what the server would refuse. */
export function capabilitiesOf(role: Role): readonly Capability[] {
  return CAPABILITIES[role];
}

/**
 * The capability a URL path needs, or null when any authenticated user may
 * open it.
 *
 * Deliberately short. A `client` owns the company's data and may read all of
 * it — invoices, libros, reports — so the gate is on the pages that *change*
 * something or reconfigure the business, not on the ones that show it. The
 * server actions behind every page are checked separately, because a route
 * check protects nothing on its own: a server action is a POST endpoint any
 * session can call directly.
 */
const ROUTE_RULES: readonly { pattern: RegExp; capability: Capability }[] = [
  { pattern: /^\/settings(\/|$)/, capability: "settings:write" },
  { pattern: /^\/api\/settings(\/|$)/, capability: "settings:write" },
  { pattern: /^\/invoices\/new(\/|$)/, capability: "invoices:write" },
  { pattern: /^\/invoices\/[^/]+\/edit(\/|$)/, capability: "invoices:write" },
  { pattern: /^\/taxes(\/|$)/, capability: "taxes:close" },
  { pattern: /^\/api\/filings(\/|$)/, capability: "taxes:close" },
  { pattern: /^\/api\/export\/(form120|tax-report|filings)(\/|$)/, capability: "taxes:close" },
];

export function routeCapability(pathname: string): Capability | null {
  return ROUTE_RULES.find((rule) => rule.pattern.test(pathname))?.capability ?? null;
}

/** Whether a role may open a path at all. */
export function canOpen(role: Role, pathname: string): boolean {
  const needed = routeCapability(pathname);
  return needed === null || can(role, needed);
}
