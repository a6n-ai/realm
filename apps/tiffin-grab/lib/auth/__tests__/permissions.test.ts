import { describe, expect, it } from "vitest";
import { roles, INVITABLE_ROLES } from "../permissions";

describe("tiffin-grab permission map", () => {
  it("has admin, member and user roles, and user holds nothing", () => {
    expect(Object.keys(roles).sort()).toEqual(["admin", "member", "user"]);
    expect(roles.user.statements).toEqual({});
  });

  it("only admin and member are invitable — customer accounts come from checkout", () => {
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

  it("withholds list and get from admin — this is the customer origin", () => {
    // /admin/list-users and /admin/get-user would page through customer PII without
    // touching audit_log. Nothing in this app needs them: the users page reads the
    // database directly. puchkaman DOES grant list, because its page gates on it and
    // its user rows are staff.
    expect(roles.admin.authorize({ user: ["list"] }).success).toBe(false);
    expect(roles.admin.authorize({ user: ["get"] }).success).toBe(false);
  });

  it("does not let member manage users", () => {
    expect(roles.member.authorize({ user: ["create"] }).success).toBe(false);
    expect(roles.member.authorize({ user: ["list"] }).success).toBe(false);
  });

  it("lets member work orders and subscriptions but not cancel or manage settings", () => {
    expect(roles.member.authorize({ order: ["read", "write"] }).success).toBe(true);
    expect(roles.member.authorize({ order: ["cancel"] }).success).toBe(false);
    expect(roles.member.authorize({ subscription: ["read", "write", "pause"] }).success).toBe(true);
    expect(roles.member.authorize({ settings: ["write"] }).success).toBe(false);
  });

  it("does not let member publish the menu", () => {
    expect(roles.member.authorize({ menu: ["read"] }).success).toBe(true);
    expect(roles.member.authorize({ menu: ["write", "publish"] }).success).toBe(false);
  });
});
