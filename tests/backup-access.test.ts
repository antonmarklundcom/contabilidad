import { describe, expect, it } from "vitest";
import { instanceBackupAccess } from "@/lib/backup";

// The backup holds every company on the instance, so a company admin may
// download it only while their company is the only one (PLAN Phase 0.3).
describe("instanceBackupAccess", () => {
  it("allows the single-tenant instance (and an empty one during setup)", () => {
    expect(instanceBackupAccess(0)).toBe("ok");
    expect(instanceBackupAccess(1)).toBe("ok");
  });

  it("refuses as soon as a second company exists", () => {
    expect(instanceBackupAccess(2)).toBe("multi_tenant");
    expect(instanceBackupAccess(50)).toBe("multi_tenant");
  });
});
