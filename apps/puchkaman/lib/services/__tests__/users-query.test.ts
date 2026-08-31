import { describe, expect, it } from "vitest";
import { parseFilterState } from "@foundry/design-system";
import { SPEC } from "@/app/(dashboard)/dashboard/settings/users/page";

function roleFacet() {
  const f = SPEC.find((x) => "field" in x && x.field === "role");
  if (!f || f.kind === "search" || f.kind === "dateRange") throw new Error("role facet missing");
  return f;
}

describe("users list facet spec", () => {
  it("has a role facet offering admin/member/user", () => {
    const role = roleFacet();
    expect(role.options.map((o) => o.value).sort()).toEqual(["admin", "member", "user"]);
  });

  it("has a status facet and a name/email search facet", () => {
    const status = SPEC.find((f) => "field" in f && f.field === "status");
    expect(status).toBeDefined();
    if (status && status.kind !== "search" && status.kind !== "dateRange") {
      expect(status.options.map((o) => o.value).sort()).toEqual(["active", "deleted", "inactive", "suspended"]);
    }

    const search = SPEC.find((f) => f.kind === "search");
    expect(search).toBeDefined();
    if (search?.kind === "search") {
      expect(search.fields.sort()).toEqual(["email", "name"]);
    }
  });

  it("no role param → parseFilterState builds no role condition on its own (page.tsx layers the staff default)", () => {
    // parseFilterState has no notion of a default — this is exactly why
    // UsersData in page.tsx ANDs in a staff role condition itself when
    // sp.role is absent. Assert that premise holds so a future change to
    // parseFilterState can't silently break the page's default.
    const s = parseFilterState(SPEC, {});
    expect(s.condition).toBeUndefined();
  });

  it("role param present → parseFilterState resolves it, overriding any default", () => {
    const s = parseFilterState(SPEC, { role: "user" });
    expect(s.condition).toBeDefined();
  });
});
