import { describe, expect, it } from "vitest";
import { assertHierarchyDepth, resolveVisibleOrgIds } from "./organization";

describe("assertHierarchyDepth", () => {
  it("allows creating a brand-level org (no parent)", () => {
    expect(() => assertHierarchyDepth(null)).not.toThrow();
  });

  it("allows creating a franchise under a brand-level parent", () => {
    expect(() => assertHierarchyDepth({ id: "org_brand", parentOrganizationId: null })).not.toThrow();
  });

  it("rejects creating a third level under an already-nested parent", () => {
    expect(() =>
      assertHierarchyDepth({ id: "org_franchise", parentOrganizationId: "org_brand" }),
    ).toThrow(/2 levels/i);
  });
});

describe("resolveVisibleOrgIds", () => {
  it("returns the member org id list for a regular staff session", () => {
    expect(resolveVisibleOrgIds({ platformRole: null, memberOrgIds: ["org_a", "org_b"] })).toEqual([
      "org_a",
      "org_b",
    ]);
  });

  it("returns an empty list for staff with no membership rows", () => {
    expect(resolveVisibleOrgIds({ platformRole: null, memberOrgIds: [] })).toEqual([]);
  });

  it("returns 'all' for a platform super_admin regardless of membership rows", () => {
    expect(resolveVisibleOrgIds({ platformRole: "super_admin", memberOrgIds: [] })).toBe("all");
  });
});
