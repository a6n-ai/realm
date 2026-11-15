import { describe, expect, it } from "vitest";
import { SECTIONS } from "../app-sidebar";

// Mirrors AppSidebar's filter: a section renders only the items whose href is allowed.
const visibleHrefs = (allowed: Set<string>) =>
  SECTIONS.map((s) => s.items.filter((i) => allowed.has(i.href)).map((i) => i.href)).filter((items) => items.length);

describe("sidebar nav filter", () => {
  it("keeps only allowed items and drops empty sections", () => {
    const out = visibleHrefs(new Set(["/dashboard", "/dashboard/orders"]));
    expect(out.flat()).toEqual(["/dashboard", "/dashboard/orders"]);
    expect(out).toHaveLength(1);
  });

  it("lists Roles under Administration", () => {
    const admin = SECTIONS.find((s) => s.label === "Administration");
    expect(admin?.items.map((i) => i.href)).toContain("/dashboard/organization/roles");
  });
});
