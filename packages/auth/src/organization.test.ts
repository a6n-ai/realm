import { describe, expect, it } from "vitest";
import { assertHierarchyDepth } from "./organization";

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
