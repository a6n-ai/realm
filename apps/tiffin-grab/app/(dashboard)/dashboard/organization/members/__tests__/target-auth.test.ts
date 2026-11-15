import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requirePermission, requirePermissionIn: vi.fn() }));
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
});

describe("global user actions follow the target", () => {
  it("target with no member row in the active org and not a customer is refused", async () => {
    asStaff();
    rows.mockResolvedValueOnce([{ id: 5n, role: "admin" }]).mockResolvedValueOnce([]);
    const res = await setUserStatus("other", "inactive");
    expect(res).toHaveProperty("error");
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("staff target in the active org needs member:update", async () => {
    asStaff();
    rows.mockResolvedValueOnce([{ id: 5n, role: "member" }]).mockResolvedValueOnce([{ id: 1n }]);
    await setUserStatus("mate", "inactive");
    expect(requirePermission).toHaveBeenCalledWith({ member: ["update"] });
    expect(setStatus).toHaveBeenCalled();
  });

  it("customer target with customer:manage is allowed", async () => {
    asStaff();
    rows.mockResolvedValueOnce([{ id: 6n, role: "user" }]).mockResolvedValueOnce([]);
    await setUserStatus("cust", "inactive");
    expect(requirePermission).toHaveBeenCalledWith({ customer: ["manage"] });
    expect(setStatus).toHaveBeenCalled();
  });

  it("customer target without customer:manage is refused", async () => {
    asStaff();
    requirePermission.mockRejectedValue(new (await import("@foundry/commons")).ForbiddenError());
    rows.mockResolvedValueOnce([{ id: 6n, role: "user" }]).mockResolvedValueOnce([]);
    const res = await setUserStatus("cust", "inactive");
    expect(res).toHaveProperty("error");
    expect(setStatus).not.toHaveBeenCalled();
  });
});
