import { describe, it, expect } from "vitest";
import { resolveCompanyId } from "@/lib/company";

/**
 * PLAN Phase 6.4 — multi-tenant activation.
 *
 * `getCompanyId()` used to be "the first company in the database". It is now
 * the session's company, with a session-less fallback for jobs and scripts.
 * The decision is pure so both branches — including the ones that must refuse
 * rather than guess — are testable without a session or a database.
 */
describe("resolveCompanyId", () => {
  it("uses the session's company, even when others exist", () => {
    expect(
      resolveCompanyId({
        hasSession: true,
        sessionCompanyId: "c2",
        companyIds: ["c1", "c2", "c3"],
      })
    ).toEqual({ ok: true, companyId: "c2" });
  });

  it("refuses a signed-in user with no company instead of picking one", () => {
    // The old behaviour would have handed this user the first company in the
    // database — someone else's, once a second tenant exists.
    expect(
      resolveCompanyId({ hasSession: true, sessionCompanyId: null, companyIds: ["c1"] })
    ).toEqual({ ok: false, reason: "no_company_for_user" });
    expect(
      resolveCompanyId({ hasSession: true, sessionCompanyId: undefined, companyIds: ["c1"] })
    ).toEqual({ ok: false, reason: "no_company_for_user" });
  });

  it("keeps single-tenant background work working", () => {
    // Jobs, /api/cron and scripts have no session.
    expect(
      resolveCompanyId({ hasSession: false, sessionCompanyId: null, companyIds: ["only"] })
    ).toEqual({ ok: true, companyId: "only" });
  });

  it("refuses to guess a tenant for a session-less caller", () => {
    expect(
      resolveCompanyId({ hasSession: false, sessionCompanyId: null, companyIds: ["a", "b"] })
    ).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("reports an empty database as such", () => {
    expect(
      resolveCompanyId({ hasSession: false, sessionCompanyId: null, companyIds: [] })
    ).toEqual({ ok: false, reason: "no_company" });
  });
});

/** PLAN Phase 0.4 — one accountant, many companies. */
describe("resolveCompanyId with a switched company", () => {
  const base = { hasSession: true, sessionCompanyId: "home", companyIds: [] };

  it("uses the switched-to company when a membership backs it", () => {
    expect(
      resolveCompanyId({ ...base, requestedCompanyId: "client7", requestedIsMember: true })
    ).toEqual({ ok: true, companyId: "client7" });
  });

  it("ignores a cookie naming a company the user is not a member of", () => {
    // A hand-edited cookie, or a membership revoked mid-session.
    expect(
      resolveCompanyId({ ...base, requestedCompanyId: "someone-else", requestedIsMember: false })
    ).toEqual({ ok: true, companyId: "home" });
  });

  it("never lets a cookie stand in for a missing session", () => {
    expect(
      resolveCompanyId({
        hasSession: false,
        sessionCompanyId: null,
        companyIds: ["a", "b"],
        requestedCompanyId: "a",
        requestedIsMember: true,
      })
    ).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("does not rescue a user with no default company via the cookie alone unless a membership backs it", () => {
    expect(
      resolveCompanyId({ hasSession: true, sessionCompanyId: null, companyIds: [], requestedCompanyId: "x", requestedIsMember: false })
    ).toEqual({ ok: false, reason: "no_company_for_user" });
  });
});
