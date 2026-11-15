import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn(), requirePermissionIn: vi.fn(), requireOwnerToGrant: vi.fn(), requireCanAssignRole: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn().mockResolvedValue({ user: { id: "usr_me" }, session: { activeOrganizationId: "org_1" } }) }));
vi.mock("@/lib/auth/role-options", () => ({
  getRoleOptions: vi.fn().mockResolvedValue([{ value: "owner", label: "owner" }, { value: "admin", label: "admin" }, { value: "member", label: "member" }]),
}));
vi.mock("@/lib/identity/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/identity/user-ids", () => ({ userIdByPublicId: vi.fn().mockResolvedValue(1n) }));
vi.mock("@/lib/services/organizations.service", () => ({
  getMemberInOrg: vi.fn(),
  countOwners: vi.fn(),
  getMemberOrganizations: vi.fn().mockResolvedValue([]),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/db/client", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) } }));
vi.mock("@/lib/auth", () => ({ auth: { api: { updateMemberRole: vi.fn().mockResolvedValue({ member: {} }) } } }));

const { auth } = await import("@/lib/auth");
const svc = await import("@/lib/services/organizations.service");
const guards = await import("@/lib/auth/guards");
const { recordAudit } = await import("@/lib/identity/audit");
const { setMemberRoles } = await import("../actions");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setMemberRoles", () => {
  it("refuses your own member row", async () => {
    vi.mocked(svc.getMemberInOrg).mockResolvedValue({ id: "mem_me", userId: 1n, role: "admin" });
    expect(await setMemberRoles("mem_me", ["member"])).toEqual(expect.objectContaining({ error: "You can't change your own role" }));
    expect(auth.api.updateMemberRole).not.toHaveBeenCalled();
  });

  it("refuses an empty role set and points to removal", async () => {
    vi.mocked(svc.getMemberInOrg).mockResolvedValue({ id: "mem_3", userId: 3n, role: "member" });
    expect(await setMemberRoles("mem_3", [])).toEqual(expect.objectContaining({ error: "Remove from org instead" }));
    expect(auth.api.updateMemberRole).not.toHaveBeenCalled();
  });

  it("refuses a role that is not offered in this org", async () => {
    vi.mocked(svc.getMemberInOrg).mockResolvedValue({ id: "mem_3", userId: 3n, role: "member" });
    expect(await setMemberRoles("mem_3", ["admin", "ghost"])).toEqual(expect.objectContaining({ error: "Unknown role." }));
    expect(auth.api.updateMemberRole).not.toHaveBeenCalled();
  });

  it("refuses to drop the last owner", async () => {
    vi.mocked(svc.getMemberInOrg).mockResolvedValue({ id: "mem_2", userId: 2n, role: "owner" });
    vi.mocked(svc.countOwners).mockResolvedValue(1);
    expect(await setMemberRoles("mem_2", ["admin"])).toEqual(expect.objectContaining({ error: "An organization needs at least one owner" }));
    expect(auth.api.updateMemberRole).not.toHaveBeenCalled();
  });

  it("writes the whole role array through Better Auth and audits from and to", async () => {
    vi.mocked(svc.getMemberInOrg).mockResolvedValue({ id: "mem_3", userId: 3n, role: "member" });
    expect(await setMemberRoles("mem_3", ["admin", "member", "admin"])).toEqual({ ok: true });
    expect(auth.api.updateMemberRole).toHaveBeenCalledWith(
      expect.objectContaining({ body: { memberId: "mem_3", role: ["admin", "member"], organizationId: "org_1" } }),
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "member",
        entityPublicId: "mem_3",
        changes: expect.objectContaining({ role: { from: "member", to: "admin,member" } }),
      }),
    );
  });

  it("checks the ceiling on each added role and on the current roles", async () => {
    vi.mocked(svc.getMemberInOrg).mockResolvedValue({ id: "mem_3", userId: 3n, role: "member" });
    await setMemberRoles("mem_3", ["admin", "member"]);
    expect(guards.requireOwnerToGrant).toHaveBeenCalledWith("org_1", "admin", "member");
    expect(guards.requireCanAssignRole).toHaveBeenCalledWith("org_1", "admin");
    expect(guards.requireCanAssignRole).toHaveBeenCalledWith("org_1", "member");
  });

  it("a role above the caller's own is refused and never reaches Better Auth", async () => {
    vi.mocked(svc.getMemberInOrg).mockResolvedValue({ id: "mem_5", userId: 5n, role: "member" });
    const { ForbiddenError } = await import("@foundry/commons");
    vi.mocked(guards.requireCanAssignRole).mockRejectedValueOnce(new ForbiddenError("too much"));
    expect(await setMemberRoles("mem_5", ["admin"])).toEqual(expect.objectContaining({ error: "too much" }));
    expect(auth.api.updateMemberRole).not.toHaveBeenCalled();
  });

  it("returns a Better Auth refusal as action error text", async () => {
    const { APIError } = await import("better-auth/api");
    vi.mocked(svc.getMemberInOrg).mockResolvedValue({ id: "mem_4", userId: 4n, role: "member" });
    vi.mocked(auth.api.updateMemberRole).mockRejectedValueOnce(new APIError("FORBIDDEN", { message: "You are not allowed to update this member" }));
    expect(await setMemberRoles("mem_4", ["admin"])).toEqual(expect.objectContaining({ error: "You are not allowed to update this member" }));
  });
});
