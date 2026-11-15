import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@foundry/commons";

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T>(fn: T) => fn }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
const memberRows = vi.fn();
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: () => memberRows() }) }) },
}));
vi.mock("@/lib/identity/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/identity/user-ids", () => ({ userIdByPublicId: vi.fn(async () => 7n) }));

const { getSession } = await import("@/lib/auth/session");
const { recordAudit } = await import("@/lib/identity/audit");
const { requirePermissionIn, requireOwnerToGrant } = await import("../guards");
const session = getSession as unknown as ReturnType<typeof vi.fn>;

const sess = (platformRole: string | null, activeOrg: string | null) => ({
  user: { id: "u1", platformRole },
  session: { activeOrganizationId: activeOrg },
});
// The caller's member row per org: the active org is irrelevant, only the target org counts.
const memberOf = (roles: Record<string, string>) =>
  memberRows.mockImplementation(async () => []).mockImplementationOnce(async () => (roles.brand ? [{ role: roles.brand }] : []));

beforeEach(() => vi.clearAllMocks());

describe("requirePermissionIn (target org)", () => {
  it("franchise admin acting on the brand org is refused (no member row there)", async () => {
    session.mockResolvedValue(sess(null, "franchise"));
    memberOf({});
    await expect(requirePermissionIn("brand", { member: ["update"] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("brand admin acting on the brand org is allowed", async () => {
    session.mockResolvedValue(sess(null, "brand"));
    memberOf({ brand: "admin" });
    await expect(requirePermissionIn("brand", { member: ["update"] })).resolves.toBeUndefined();
  });

  it("super_admin is allowed and audited", async () => {
    session.mockResolvedValue(sess("super_admin", null));
    await expect(requirePermissionIn("brand", { member: ["update"] })).resolves.toBeUndefined();
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ changes: { _action: "platform_bypass", perms: { member: ["update"] } } }));
  });
});

describe("requireOwnerToGrant", () => {
  it("admin assigning owner is refused, also inside a comma list", async () => {
    session.mockResolvedValue(sess(null, "brand"));
    memberOf({ brand: "admin" });
    await expect(requireOwnerToGrant("brand", "owner")).rejects.toBeInstanceOf(ForbiddenError);
    memberOf({ brand: "admin" });
    await expect(requireOwnerToGrant("brand", "admin, owner")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("owner assigning owner is allowed", async () => {
    session.mockResolvedValue(sess(null, "brand"));
    memberOf({ brand: "owner" });
    await expect(requireOwnerToGrant("brand", "owner")).resolves.toBeUndefined();
  });

  it("non-owner roles need no owner check", async () => {
    await expect(requireOwnerToGrant("brand", "admin", null)).resolves.toBeUndefined();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("super_admin may grant owner", async () => {
    session.mockResolvedValue(sess("super_admin", null));
    await expect(requireOwnerToGrant("brand", "owner")).resolves.toBeUndefined();
  });
});
