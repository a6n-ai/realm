import { describe, expect, it } from "vitest";
import { roles, INVITABLE_ROLES } from "../permissions";

describe("xplorers permission map", () => {
  it("is staff-only in the console map — customers are absent, not empty", () => {
    expect(Object.keys(roles).sort()).toEqual(["admin", "member"]);
    expect(INVITABLE_ROLES).toEqual(["admin", "member"]);
  });

  it("lets admin create users and set roles", () => {
    expect(roles.admin.authorize({ user: ["create", "set-role"] }).success).toBe(true);
    expect(roles.admin.authorize({ staff: ["invite", "suspend", "remove"] }).success).toBe(true);
  });

  it("denies admin the plugin endpoints this app deliberately does not mount", () => {
    for (const action of [
      "ban",
      "impersonate",
      "impersonate-admins",
      "delete",
      "set-password",
      "set-email",
      "update",
    ] as const) {
      expect(roles.admin.authorize({ user: [action] }).success).toBe(false);
    }
  });

  it("does not let member manage users", () => {
    expect(roles.member.authorize({ user: ["create"] }).success).toBe(false);
    expect(roles.member.authorize({ user: ["list"] }).success).toBe(false);
  });

  it("lets admin manage studio sessions", () => {
    expect(roles.admin.authorize({ studioSession: ["create", "read", "update", "delete"] }).success).toBe(true);
    expect(roles.admin.authorize({ booking: ["read"] }).success).toBe(true);
  });

  it("lets member read sessions, not write them", () => {
    expect(roles.member.authorize({ studioSession: ["read"] }).success).toBe(true);
    expect(roles.member.authorize({ studioSession: ["create"] }).success).toBe(false);
    expect(roles.member.authorize({ studioSession: ["update"] }).success).toBe(false);
  });
});
