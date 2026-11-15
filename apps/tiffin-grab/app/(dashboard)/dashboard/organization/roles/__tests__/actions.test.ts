import { beforeEach, describe, expect, it, vi } from "vitest";

const holders = vi.hoisted(() => ({ counts: {} as Record<string, number> }));
const orgRoleApi = vi.hoisted(() => ({ createOrgRole: vi.fn(), updateOrgRole: vi.fn(), deleteOrgRole: vi.fn() }));

vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn(), assertStaffSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn().mockResolvedValue({ user: { id: "usr_me" }, session: { activeOrganizationId: "org_1" } }) }));
vi.mock("@/lib/identity/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/identity/user-ids", () => ({ userIdByPublicId: vi.fn().mockResolvedValue(7n) }));
vi.mock("@/lib/services/organizations.service", () => ({ getRoleHolderCounts: async () => holders.counts }));
vi.mock("@/lib/auth/org-role-api", async () => {
  const { APIError } = await import("better-auth/api");
  const { ValidationError } = await import("@foundry/commons");
  return {
    orgRoleApi,
    authApi: async <T,>(fn: () => Promise<T>) => {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof APIError) throw new ValidationError(e.message);
        throw e;
      }
    },
  };
});
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "role_1", role: "cashier" }] }) }) }) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  holders.counts = {};
  orgRoleApi.createOrgRole.mockResolvedValue({ roleData: { id: "role_new" } });
  orgRoleApi.updateOrgRole.mockResolvedValue({});
  orgRoleApi.deleteOrgRole.mockResolvedValue({});
});

describe("createRole", () => {
  it("calls createOrgRole with the exact body and audits it", async () => {
    const { createRole } = await import("../actions");
    const { recordAudit } = await import("@/lib/identity/audit");
    const permission = { order: ["read"] };
    expect(await createRole({ name: " cashier ", permission })).toEqual({ ok: true });
    expect(orgRoleApi.createOrgRole).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { role: "cashier", permission, organizationId: "org_1" },
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "org_role", entityPublicId: "role_new", operation: "create", createdBy: 7n }),
    );
  });

  it.each(["owner", "admin", "member"])("refuses the built-in name %s", async (name) => {
    const { createRole } = await import("../actions");
    expect(await createRole({ name, permission: {} })).toEqual(expect.objectContaining({ error: expect.stringMatching(/built-in/) }));
    expect(orgRoleApi.createOrgRole).not.toHaveBeenCalled();
  });

  it("returns a Better Auth refusal as error text instead of throwing", async () => {
    const { APIError } = await import("better-auth/api");
    orgRoleApi.createOrgRole.mockRejectedValueOnce(new APIError("FORBIDDEN", { message: "You are not allowed to grant finance:refund" }));
    const { createRole } = await import("../actions");
    expect(await createRole({ name: "cashier", permission: { finance: ["refund"] } })).toEqual(
      expect.objectContaining({ error: "You are not allowed to grant finance:refund" }),
    );
  });
});

describe("updateRole", () => {
  it("refuses a rename while members hold the role", async () => {
    holders.counts = { cashier: 2 };
    const { updateRole } = await import("../actions");
    expect(await updateRole("role_1", { name: "till", permission: {} })).toEqual(
      expect.objectContaining({ error: expect.stringMatching(/2 members still have this role/) }),
    );
    expect(orgRoleApi.updateOrgRole).not.toHaveBeenCalled();
  });

  it("updates permissions without renaming", async () => {
    const { updateRole } = await import("../actions");
    expect(await updateRole("role_1", { name: "cashier", permission: { order: ["read"] } })).toEqual({ ok: true });
    expect(orgRoleApi.updateOrgRole).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { roleId: "role_1", organizationId: "org_1", data: { permission: { order: ["read"] } } },
    });
  });
});

describe("deleteRole", () => {
  it("refuses while members hold the role", async () => {
    holders.counts = { cashier: 2 };
    const { deleteRole } = await import("../actions");
    expect(await deleteRole("role_1")).toEqual({ error: "2 members still have this role", status: 400 });
    expect(orgRoleApi.deleteOrgRole).not.toHaveBeenCalled();
  });

  it("deletes an unused role and audits it", async () => {
    const { deleteRole } = await import("../actions");
    const { recordAudit } = await import("@/lib/identity/audit");
    expect(await deleteRole("role_1")).toEqual({ ok: true });
    expect(orgRoleApi.deleteOrgRole).toHaveBeenCalledWith({ headers: expect.any(Headers), body: { roleId: "role_1", organizationId: "org_1" } });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entity: "org_role", operation: "delete" }));
  });
});
