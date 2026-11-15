import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, ForbiddenError } from "@foundry/commons";

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T>(fn: T) => fn }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
const dbRows = vi.fn();
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: () => dbRows() }) }) },
}));
vi.mock("@/lib/identity/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/identity/user-ids", () => ({ userIdByPublicId: vi.fn(async () => 7n) }));

const { getSession } = await import("@/lib/auth/session");
const { recordAudit } = await import("@/lib/identity/audit");
const { can, requirePermission } = await import("../guards");
const session = getSession as unknown as ReturnType<typeof vi.fn>;

const sess = (platformRole: string | null, org: string | null) => ({
  user: { id: "u1", platformRole },
  session: { activeOrganizationId: org },
});

beforeEach(() => vi.clearAllMocks());

describe("org guards", () => {
  it("custom kitchen role: can menu:write, denied finance:read", async () => {
    session.mockResolvedValue(sess(null, "o1"));
    // Member row first, then the custom role; Better Auth stores permission as JSON text.
    const kitchen = [{ role: "kitchen" }];
    const custom = [{ role: "kitchen", permission: JSON.stringify({ menu: ["write"] }) }];
    dbRows.mockResolvedValueOnce(kitchen).mockResolvedValueOnce(custom).mockResolvedValueOnce(kitchen).mockResolvedValueOnce(custom);
    expect(await can({ menu: ["write"] })).toBe(true);
    await expect(requirePermission({ finance: ["read"] })).rejects.toBeInstanceOf(ForbiddenError);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("super_admin without a member row is allowed and audited", async () => {
    session.mockResolvedValue(sess("super_admin", null));
    await expect(requirePermission({ finance: ["read"] })).resolves.toBeUndefined();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "auth", operation: "update", changes: { _action: "platform_bypass", perms: { finance: ["read"] } } }),
    );
    expect(dbRows).not.toHaveBeenCalled();
  });

  it("no active org is denied", async () => {
    session.mockResolvedValue(sess(null, null));
    expect(await can({ menu: ["read"] })).toBe(false);
    await expect(requirePermission({ menu: ["read"] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("no session throws AuthError", async () => {
    session.mockResolvedValue(null);
    await expect(requirePermission({ menu: ["read"] })).rejects.toBeInstanceOf(AuthError);
  });
});
