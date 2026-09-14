import { describe, expect, it } from "vitest";
import { Role } from "@foundry/commons";
import { roleCan } from "@/lib/auth/guards";

describe("member reaches its intended surfaces", () => {
  it("member may read settings", () => {
    expect(roleCan(Role.MEMBER, { settings: ["read"] })).toBe(true);
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
