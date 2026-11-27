import { describe, expect, test } from "vitest";
import { platformRoles, staticAllows, type OrgPermission } from "../permissions";

describe("organisation roles", () => {
  const APP: OrgPermission[] = ["inquiry:read", "inquiry:create", "inquiry:update", "inquiry:note", "inquiry:claim", "inquiry:assign", "source:read", "source:manage"];

  test("owner and admin hold every app permission", () => {
    for (const p of APP) {
      expect(staticAllows("owner", p), `owner ${p}`).toBe(true);
      expect(staticAllows("admin", p), `admin ${p}`).toBe(true);
    }
  });

  test("member works inquiries but cannot assign or manage sources", () => {
    for (const p of ["inquiry:read", "inquiry:create", "inquiry:update", "inquiry:note", "inquiry:claim", "source:read"] as OrgPermission[]) {
      expect(staticAllows("member", p), p).toBe(true);
    }
    expect(staticAllows("member", "inquiry:assign")).toBe(false);
    expect(staticAllows("member", "source:manage")).toBe(false);
    expect(staticAllows("member", "member:create")).toBe(false);
  });

  test("only the owner may delete the organisation", () => {
    expect(staticAllows("owner", "organization:delete")).toBe(true);
    expect(staticAllows("admin", "organization:delete")).toBe(false);
  });

  test("platform roles are super_admin and user only", () => {
    expect(Object.keys(platformRoles).sort()).toEqual(["super_admin", "user"]);
  });
});
