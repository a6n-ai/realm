import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@foundry/commons";

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T>(fn: T) => fn }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
const dbRows = vi.fn();
vi.mock("@/db/client", () => ({ db: { select: () => ({ from: () => ({ where: () => dbRows() }) }) } }));
vi.mock("@/lib/identity/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/identity/user-ids", () => ({ userIdByPublicId: vi.fn(async () => 7n) }));

const { getSession } = await import("@/lib/auth/session");
const { canAssignRole, requireCanAssignRole } = await import("../guards");

beforeEach(() => {
  vi.resetAllMocks();
  (getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1", platformRole: null }, session: { activeOrganizationId: "o1" } });
});

const asCustom = (permission: object) =>
  dbRows.mockResolvedValueOnce([{ role: "helper" }]).mockResolvedValueOnce([{ role: "helper", permission: JSON.stringify(permission) }]);

describe("role ceiling", () => {
  it("member:update-only custom role cannot assign admin", async () => {
    asCustom({ member: ["update"] });
    await expect(requireCanAssignRole("o1", "admin")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("admin can assign member and a custom role within its rights", async () => {
    dbRows.mockResolvedValueOnce([{ role: "admin" }]);
    expect(await canAssignRole("o1", "member")).toBe(true);
    dbRows.mockResolvedValueOnce([{ role: "admin" }]).mockResolvedValueOnce([{ permission: JSON.stringify({ menu: ["write"] }) }]);
    expect(await canAssignRole("o1", "chef")).toBe(true);
  });

  it("owner can assign admin", async () => {
    dbRows.mockResolvedValueOnce([{ role: "owner" }]);
    expect(await canAssignRole("o1", "admin")).toBe(true);
  });

  it("an unknown role name is never assignable", async () => {
    dbRows.mockResolvedValueOnce([{ role: "admin" }]).mockResolvedValueOnce([]);
    expect(await canAssignRole("o1", "ghost")).toBe(false);
  });
});
