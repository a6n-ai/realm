import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const requirePermissionIn = vi.fn();
const requireOwnerToGrant = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requirePermission, requirePermissionIn, requireOwnerToGrant, assertStaffSession: vi.fn() }));
vi.mock("@/lib/catalog/load", () => ({ invalidateCatalogSnapshot: async () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
const getSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/auth", () => ({ auth: { api: {} } }));
const setStatus = vi.fn();
vi.mock("@/lib/services/users.service", () => ({
  usersService: { setStatus, updateContact: vi.fn() },
  ContactTakenError: class extends Error {},
}));
vi.mock("@/lib/services/organizations.service", () => ({ getBrandOrgId: vi.fn(), getMemberOrganizations: vi.fn() }));
vi.mock("@/lib/services/users-invite", () => ({ inviteUser: vi.fn() }));
vi.mock("@/lib/auth/invite-links", () => ({}));
const rows = vi.fn();
vi.mock("@/db/client", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: () => rows(), then: (f: (r: unknown) => unknown) => rows().then(f) }) }) }) } }));

const { setUserStatus } = await import("../actions");

const asStaff = (platformRole: string | null = null) =>
  getSession.mockResolvedValue({ user: { id: "me", publicId: "me", platformRole }, session: { activeOrganizationId: "org1" } });

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue(undefined);
  requirePermissionIn.mockResolvedValue(undefined);
  requireOwnerToGrant.mockResolvedValue(undefined);
});

describe("global user actions follow the target", () => {
  it("staff target with no member row and not a customer is refused", async () => {
    asStaff();
    rows.mockResolvedValueOnce([{ id: 5n, role: "admin", platformRole: null }]).mockResolvedValueOnce([]);
    const res = await setUserStatus("other", "inactive");
    expect(res).toHaveProperty("error");
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("super_admin target is refused for a non-super_admin caller", async () => {
    asStaff();
    rows.mockResolvedValueOnce([{ id: 9n, role: "admin", platformRole: "super_admin" }]);
    const res = await setUserStatus("boss", "inactive");
    expect(res).toHaveProperty("error");
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("staff target needs member:update and the owner rule in every org it belongs to", async () => {
    asStaff();
    rows
      .mockResolvedValueOnce([{ id: 5n, role: "member", platformRole: null }])
      .mockResolvedValueOnce([{ organizationId: "org1", role: "member" }, { organizationId: "brand", role: "owner" }]);
    await setUserStatus("mate", "inactive");
    expect(requirePermissionIn).toHaveBeenCalledWith("org1", { member: ["update"] });
    expect(requirePermissionIn).toHaveBeenCalledWith("brand", { member: ["update"] });
    expect(requireOwnerToGrant).toHaveBeenCalledWith("brand", "owner");
    expect(setStatus).toHaveBeenCalled();
  });

  it("refused when the caller lacks authority in one of the target's orgs", async () => {
    asStaff();
    requirePermissionIn.mockImplementation(async (org: string) => {
      if (org === "brand") throw new (await import("@foundry/commons")).ForbiddenError();
    });
    rows
      .mockResolvedValueOnce([{ id: 5n, role: "member", platformRole: null }])
      .mockResolvedValueOnce([{ organizationId: "org1", role: "member" }, { organizationId: "brand", role: "admin" }]);
    const res = await setUserStatus("mate", "inactive");
    expect(res).toHaveProperty("error");
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("customer target with customer:manage is allowed", async () => {
    asStaff();
    rows.mockResolvedValueOnce([{ id: 6n, role: "user", platformRole: null }]).mockResolvedValueOnce([]);
    await setUserStatus("cust", "inactive");
    expect(requirePermission).toHaveBeenCalledWith({ customer: ["manage"] });
    expect(setStatus).toHaveBeenCalled();
  });

  it("customer target without customer:manage is refused", async () => {
    asStaff();
    requirePermission.mockRejectedValue(new (await import("@foundry/commons")).ForbiddenError());
    rows.mockResolvedValueOnce([{ id: 6n, role: "user", platformRole: null }]).mockResolvedValueOnce([]);
    const res = await setUserStatus("cust", "inactive");
    expect(res).toHaveProperty("error");
    expect(setStatus).not.toHaveBeenCalled();
  });
});
