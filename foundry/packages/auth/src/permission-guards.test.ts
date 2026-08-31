import { describe, expect, it } from "vitest";
import { createAccessControl } from "better-auth/plugins/access";
import { AuthError, ForbiddenError } from "@foundry/commons";
import { createPermissionGuards } from "./permission-guards";

const ac = createAccessControl({
  order: ["read", "refund"],
  user: ["create", "list"],
} as const);

const roles = {
  admin: ac.newRole({ order: ["read", "refund"], user: ["create", "list"] }),
  member: ac.newRole({ order: ["read"] }),
};

const sessionFor = (role: string | null) => async () =>
  role ? { user: { role } } : null;

describe("createPermissionGuards", () => {
  it("allows a role that holds the permission", async () => {
    const { requirePermission } = createPermissionGuards(sessionFor("admin"), roles);
    await expect(requirePermission({ user: ["create"] })).resolves.toBeUndefined();
  });

  it("denies a role that lacks the action", async () => {
    const { requirePermission } = createPermissionGuards(sessionFor("member"), roles);
    await expect(requirePermission({ order: ["refund"] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("denies a role that lacks the resource entirely", async () => {
    const { requirePermission } = createPermissionGuards(sessionFor("member"), roles);
    await expect(requirePermission({ user: ["list"] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("denies a role that is not in the map at all", async () => {
    const { requirePermission } = createPermissionGuards(sessionFor("ghost"), roles);
    await expect(requirePermission({ order: ["read"] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws AuthError, not ForbiddenError, when there is no session", async () => {
    const { requirePermission } = createPermissionGuards(sessionFor(null), roles);
    await expect(requirePermission({ order: ["read"] })).rejects.toBeInstanceOf(AuthError);
  });

  it("requires every action listed for a resource", async () => {
    const { roleCan } = createPermissionGuards(sessionFor("member"), roles);
    expect(roleCan("member", { order: ["read"] })).toBe(true);
    expect(roleCan("member", { order: ["read", "refund"] })).toBe(false);
  });

  it("requires every resource listed", async () => {
    const { roleCan } = createPermissionGuards(sessionFor("admin"), roles);
    expect(roleCan("admin", { order: ["read"], user: ["create"] })).toBe(true);
    expect(roleCan("member", { order: ["read"], user: ["create"] })).toBe(false);
  });
});
