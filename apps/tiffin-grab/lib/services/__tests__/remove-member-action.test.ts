import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@foundry/commons";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({
  requirePermission: vi.fn(),
  requirePermissionIn: vi.fn(),
  requireOwnerToGrant: vi.fn(),
  requireCanAssignRole: vi.fn(),
}));
vi.mock("@/lib/auth/role-options", () => ({ getRoleOptions: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn().mockResolvedValue({ user: { id: "usr_me" }, session: { activeOrganizationId: "org_1" } }),
}));
vi.mock("@/lib/identity/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/identity/user-ids", () => ({ userIdByPublicId: vi.fn(async () => 9n), systemUserId: vi.fn() }));
vi.mock("@/lib/landing/public-cache", () => ({ evictPublicPages: vi.fn() }));
vi.mock("@/lib/services/organizations.service", () => ({
  addMember: vi.fn(),
  countOwners: vi.fn(),
  removeMember: vi.fn(),
  searchUsersByEmail: vi.fn(),
  updateOrganization: vi.fn(),
}));
const dbRows = vi.fn();
vi.mock("@/db/client", () => ({ db: { select: () => ({ from: () => ({ where: () => dbRows() }) }) } }));

const { removeMemberAction } = await import("../organizations-actions");
const svc = await import("@/lib/services/organizations.service");
const guards = await import("@/lib/auth/guards");
const { recordAudit } = await import("@/lib/identity/audit");

beforeEach(() => {
  vi.clearAllMocks();
  dbRows.mockReset();
});

describe("removeMemberAction", () => {
  it("refuses your own row without removing anything", async () => {
    expect(await removeMemberAction("org_1", "usr_me")).toEqual({
      ok: false,
      error: "You can't remove yourself from the organization.",
    });
    expect(svc.removeMember).not.toHaveBeenCalled();
  });

  it("refuses to remove the last owner", async () => {
    dbRows.mockResolvedValueOnce([{ role: "owner" }]);
    vi.mocked(svc.countOwners).mockResolvedValueOnce(1);
    expect(await removeMemberAction("org_1", "usr_2")).toEqual({
      ok: false,
      error: "An organization needs at least one owner",
    });
    expect(svc.removeMember).not.toHaveBeenCalled();
  });

  it("removes the member and audits the removal", async () => {
    dbRows.mockResolvedValueOnce([{ role: "admin" }]);
    expect(await removeMemberAction("org_1", "usr_2")).toEqual({ ok: true });
    expect(svc.removeMember).toHaveBeenCalledWith("org_1", "usr_2");
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "member", operation: "delete", entityPublicId: "usr_2", createdBy: 9n }),
    );
  });

  it("a removal above the caller's ceiling throws and removes nothing", async () => {
    dbRows.mockResolvedValueOnce([{ role: "admin" }]);
    vi.mocked(guards.requireCanAssignRole).mockRejectedValueOnce(new ForbiddenError());
    await expect(removeMemberAction("org_1", "usr_2")).rejects.toBeInstanceOf(ForbiddenError);
    expect(svc.removeMember).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
