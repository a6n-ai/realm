import { describe, expect, it } from "vitest";
import { shouldAuditBypass } from "../bypass-audit";

describe("shouldAuditBypass", () => {
  it("audits a permission set once per request", () => {
    const seen = new Set<string>();
    expect(shouldAuditBypass(seen, "u1", { order: ["read"] })).toBe(true);
    expect(shouldAuditBypass(seen, "u1", { order: ["read"] })).toBe(false);
  });

  it("treats key and action order as the same set", () => {
    const seen = new Set<string>();
    expect(shouldAuditBypass(seen, "u1", { order: ["read", "write"], finance: ["read"] })).toBe(true);
    expect(shouldAuditBypass(seen, "u1", { finance: ["read"], order: ["write", "read"] })).toBe(false);
  });

  it("audits a different set, user or request", () => {
    const seen = new Set<string>();
    shouldAuditBypass(seen, "u1", { order: ["read"] });
    expect(shouldAuditBypass(seen, "u1", { order: ["write"] })).toBe(true);
    expect(shouldAuditBypass(seen, "u2", { order: ["read"] })).toBe(true);
    expect(shouldAuditBypass(new Set(), "u1", { order: ["read"] })).toBe(true);
  });
});
