import { describe, expect, it } from "vitest";
import { Role, type RoleValue } from "@foundry/commons";
import { getNavSections } from "@/components/dashboard/app-sidebar";
import { roleCan } from "@/lib/auth/guards";
import { grantedKeys } from "@/lib/auth/nav-permissions";

function navTitles(role: RoleValue) {
  return getNavSections({ granted: grantedKeys(role) }).flatMap((s) => s.items.map((i) => i.title));
}

describe("member reaches its intended surfaces", () => {
  it("admin sees Settings; member does not", () => {
    expect(grantedKeys(Role.ADMIN)).toContain("settings:write");
    expect(navTitles(Role.ADMIN)).toContain("Settings");
    expect(navTitles(Role.ADMIN)).toEqual(expect.arrayContaining(["Payments", "Ledger"]));
    expect(grantedKeys(Role.MEMBER)).not.toContain("settings:write");
    expect(navTitles(Role.MEMBER)).not.toContain("Settings");
    expect(navTitles(Role.MEMBER)).not.toContain("Payments");
    expect(navTitles(Role.MEMBER)).not.toContain("Ledger");
  });
  it("member may read settings", () => {
    expect(roleCan(Role.MEMBER, { settings: ["read"] })).toBe(true);
  });

  it("member may read studio sessions but not create them", () => {
    expect(roleCan(Role.MEMBER, { studioSession: ["read"] } as never)).toBe(true);
    expect(roleCan(Role.MEMBER, { studioSession: ["create"] } as never)).toBe(false);
  });

  it.each([
    ["staff invites", { staff: ["invite"] }],
    ["user listing", { user: ["list"] }],
  ])("member may NOT reach %s", (_label, permissions) => {
    expect(roleCan(Role.MEMBER, permissions as never)).toBe(false);
  });

  it("a customer reaches no console surface at all", () => {
    expect(roleCan(Role.USER, { user: ["list"] })).toBe(false);
    expect(roleCan(Role.USER, { settings: ["read"] })).toBe(false);
  });
});
