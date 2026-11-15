import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@foundry/commons";

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T>(fn: T) => fn }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
// Each query resolves to the next queued result, in call order.
const queue = vi.hoisted(() => ({ results: [] as unknown[][] }));
const take = () => Promise.resolve(queue.results.shift() ?? []);
vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({ innerJoin: () => ({ where: take }), where: take }),
    }),
  },
}));
vi.mock("@/lib/identity/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/identity/user-ids", () => ({ userIdByPublicId: vi.fn(async () => 7n) }));

const { getSession } = await import("@/lib/auth/session");
const { resolveMemberAccess } = await import("@/lib/auth/org-access");
const { appStatement } = await import("@/lib/auth/permissions");
const { getOrgAccessMatrix } = await import("../org-access-matrix");
const session = getSession as unknown as ReturnType<typeof vi.fn>;

const caller = { user: { id: "u1", platformRole: null, role: "admin" }, session: { activeOrganizationId: "o1" } };

beforeEach(() => {
  vi.clearAllMocks();
  queue.results = [];
});

describe("resolveMemberAccess", () => {
  it("a comma list is the union of its roles", () => {
    const access = resolveMemberAccess("a, b", { a: { menu: ["read"] }, b: { menu: ["write"], order: ["read"] } });
    expect(access.roles).toEqual(["a", "b"]);
    expect(access.permissions.menu?.sort()).toEqual(["read", "write"]);
    expect(access.permissions.order).toEqual(["read"]);
    expect(access.grants.menu).toEqual({ read: ["a"], write: ["b"] });
  });

  it("grants name every role that grants the action", () => {
    const access = resolveMemberAccess("a,b", { a: { menu: ["read"] }, b: { menu: ["read"] } });
    expect(access.grants.menu?.read).toEqual(["a", "b"]);
  });

  it("a deleted custom role is unresolved and yields no roles", () => {
    const access = resolveMemberAccess("gone", {});
    expect(access.unresolved).toEqual(["gone"]);
    expect(access.roles).toEqual([]);
    expect(access.permissions).toEqual({});
  });

  it("owner holds every action of every resource", () => {
    const access = resolveMemberAccess("owner", {});
    for (const [resource, actions] of Object.entries(appStatement)) {
      expect(access.permissions[resource]?.sort()).toEqual([...actions].sort());
    }
  });
});

describe("getOrgAccessMatrix", () => {
  it("refuses a caller without member:update in that org", async () => {
    session.mockResolvedValue(caller);
    queue.results = [
      [{ role: "viewer" }],
      [{ role: "viewer", permission: JSON.stringify({ order: ["read"] }) }],
    ];
    await expect(getOrgAccessMatrix("o1")).rejects.toBeInstanceOf(ForbiddenError);
    expect(queue.results).toEqual([]);
  });

  it("builds rows, flags members with no role, lists platform admins", async () => {
    session.mockResolvedValue(caller);
    queue.results = [
      [{ role: "owner" }],
      [
        { id: "mem_1", role: "owner", name: "Owen", email: "owen@example.test" },
        { id: "mem_2", role: "admin,kitchen", name: null, email: "kitchen@example.test" },
        { id: "mem_3", role: "gone", name: "Gone", email: "gone@example.test" },
        { id: "mem_4", role: "", name: "Empty", email: "empty@example.test" },
      ],
      [{ role: "kitchen", permission: JSON.stringify({ menu: ["read", "write"] }) }],
      [{ name: "Root", email: "root@example.test" }],
    ];
    const matrix = await getOrgAccessMatrix("o1");
    expect(matrix.rows.map((r) => r.id)).toEqual(["mem_1", "mem_2", "mem_3", "mem_4"]);
    expect(matrix.rows[1]).toEqual(expect.objectContaining({ name: "kitchen@example.test", roles: ["admin", "kitchen"] }));
    expect(matrix.rows[1]?.grants.menu?.write).toContain("kitchen");
    expect(matrix.rows[2]?.roles).toEqual([]);
    expect(matrix.noRole).toEqual(["mem_3", "mem_4"]);
    expect(matrix.platformAdmins).toEqual([{ name: "Root", email: "root@example.test" }]);
  });
});
