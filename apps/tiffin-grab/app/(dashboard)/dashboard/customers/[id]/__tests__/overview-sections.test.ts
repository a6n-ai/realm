import { describe, expect, it } from "vitest";
import { overviewSections } from "../overview-sections";

// Grants are "resource:verb" strings; a permission map is allowed when every verb it lists is granted.
const granting = (...grants: string[]) => (perms: Record<string, string[]>) =>
  Object.entries(perms).every(([resource, verbs]) => verbs.every((v) => grants.includes(`${resource}:${v}`)));

describe("overviewSections", () => {
  it("shows no sections to a viewer with only customer:read", async () => {
    expect(await overviewSections(granting("customer:read"))).toEqual([]);
  });

  it("omits the payment section without finance:read", async () => {
    const sections = await overviewSections(granting("customer:read", "customer:manage", "inquiry:read"));
    expect(sections).toEqual(["contact", "inquiries"]);
    expect(sections).not.toContain("payment");
  });

  it("lists every section in display order when all are granted", async () => {
    expect(await overviewSections(granting("finance:read", "customer:manage", "inquiry:read"))).toEqual(["payment", "contact", "inquiries"]);
  });

  it("accepts an async permission check", async () => {
    expect(await overviewSections(async (p) => granting("finance:read")(p))).toEqual(["payment"]);
  });
});
