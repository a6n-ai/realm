import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@foundry/commons";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({
  requirePermission: vi.fn(),
  requirePermissionIn: vi.fn(),
  requireOwnerToGrant: vi.fn(),
  requireCanAssignRole: vi.fn(),
  requireCanActOnRoles: vi.fn(),
}));
vi.mock("@/lib/auth/role-options", () => ({
  getRoleOptions: vi.fn(async () => [
    { value: "admin", label: "admin" },
    { value: "kitchen", label: "kitchen" },
  ]),
}));
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
vi.mock("@/db/client", () => ({ db: {} }));

const { addMemberAction } = await import("../organizations-actions");
const svc = await import("@/lib/services/organizations.service");
const guards = await import("@/lib/auth/guards");
const { recordAudit } = await import("@/lib/identity/audit");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("addMemberAction", () => {
  it("adds the member in the chosen role and audits it", async () => {
    expect(await addMemberAction("org_1", "usr_2", "kitchen")).toEqual({ ok: true });
    expect(svc.addMember).toHaveBeenCalledWith("org_1", "usr_2", "kitchen");
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "member",
        operation: "create",
        entityPublicId: "usr_2",
        changes: { organizationId: "org_1", role: "kitchen" },
        createdBy: 9n,
      }),
    );
  });

  it("refuses a role that is not an option for the org, writing nothing", async () => {
    expect(await addMemberAction("org_1", "usr_2", "owner")).toEqual({ ok: false, error: "Unknown role." });
    expect(svc.addMember).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("returns a ceiling refusal as a value and adds nothing", async () => {
    vi.mocked(guards.requireCanAssignRole).mockRejectedValueOnce(new ForbiddenError("ceiling"));
    expect(await addMemberAction("org_1", "usr_2", "admin")).toEqual({ ok: false, error: "ceiling" });
    expect(svc.addMember).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("returns an owner-grant refusal as a value and adds nothing", async () => {
    vi.mocked(guards.requireOwnerToGrant).mockRejectedValueOnce(new ForbiddenError("owner"));
    expect(await addMemberAction("org_1", "usr_2", "admin")).toEqual({ ok: false, error: "owner" });
    expect(svc.addMember).not.toHaveBeenCalled();
  });
});
