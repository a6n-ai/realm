import { describe, expect, it } from "vitest";
import { roles, INVITABLE_ROLES } from "../permissions";

describe("puchkaman permission map", () => {
  it("is staff-only — there is no customer role", () => {
    expect(Object.keys(roles).sort()).toEqual(["admin", "member"]);
    expect(INVITABLE_ROLES).toEqual(["admin", "member"]);
  });

  it("lets admin manage users", () => {
    expect(roles.admin.authorize({ user: ["create", "set-role", "delete"] }).success).toBe(true);
  });

  it("does not let member manage users", () => {
    expect(roles.member.authorize({ user: ["create"] }).success).toBe(false);
    expect(roles.member.authorize({ user: ["list"] }).success).toBe(false);
  });

  it("lets member work orders but not refund them", () => {
    expect(roles.member.authorize({ order: ["read", "write"] }).success).toBe(true);
    expect(roles.member.authorize({ order: ["refund"] }).success).toBe(false);
  });

  it("does not let member change settings", () => {
    expect(roles.member.authorize({ settings: ["write"] }).success).toBe(false);
  });
});
