import { describe, expect, it } from "vitest";
import { roles, INVITABLE_ROLES } from "../permissions";

describe("puchkaman permission map", () => {
  it("is staff-only — there is no customer role", () => {
    expect(Object.keys(roles).sort()).toEqual(["admin", "member"]);
    expect(INVITABLE_ROLES).toEqual(["admin", "member"]);
  });

  it("lets admin create users and set roles", () => {
    expect(roles.admin.authorize({ user: ["create", "set-role"] }).success).toBe(true);
    expect(roles.admin.authorize({ staff: ["invite", "suspend", "remove"] }).success).toBe(true);
  });

  it("denies admin the plugin endpoints this app deliberately does not mount", () => {
    // ban / impersonate / delete authorize /admin/ban-user, /admin/impersonate-user
    // and /admin/remove-user, which better-auth mounts unconditionally. If a future
    // edit spreads adminAc.statements back in, these turn red — which is the point.
    for (const action of ["ban", "impersonate", "impersonate-admins", "delete", "set-password", "set-email", "update"] as const) {
      expect(roles.admin.authorize({ user: [action] }).success).toBe(false);
    }
  });

  it("does not let member manage users", () => {
    expect(roles.member.authorize({ user: ["create"] }).success).toBe(false);
    expect(roles.member.authorize({ user: ["list"] }).success).toBe(false);
  });

  it("lets member work orders but not refund them", () => {
    expect(roles.member.authorize({ order: ["read", "write"] }).success).toBe(true);
    expect(roles.member.authorize({ order: ["refund"] }).success).toBe(false);
  });

  it("lets member change settings, narrowly granted for the review-widget page", () => {
    expect(roles.member.authorize({ settings: ["write"] }).success).toBe(true);
  });
});
