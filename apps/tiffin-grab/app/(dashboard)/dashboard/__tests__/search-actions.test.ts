import { beforeEach, describe, expect, it, vi } from "vitest";

const can = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ can }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "u", role: "member" } }) }));
vi.mock("@/lib/auth/visible-orgs", () => ({ resolveSessionVisibleOrgIds: async () => "all" }));
const query = vi.fn(async () => [] as unknown[]);
const chain: Record<string, unknown> = {};
for (const k of ["select", "from", "where", "leftJoin", "orderBy"]) chain[k] = () => chain;
chain.limit = query;
vi.mock("@/db/client", () => ({ db: chain }));

const { globalSearch } = await import("../search-actions");

beforeEach(() => vi.clearAllMocks());

describe("globalSearch", () => {
  it("runs only the groups whose read permission holds", async () => {
    can.mockImplementation(async (p: Record<string, string[]>) => "order" in p);
    await globalSearch("kumar");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("role without customer:read gets no customers group", async () => {
    query.mockResolvedValue([{ publicId: "x", fullName: "A", deploymentId: "d", status: "s", email: "e", name: "n", subject: "s", phone: "p", stage: "st" }]);
    can.mockImplementation(async (p: Record<string, string[]>) => !("customer" in p));
    const res = await globalSearch("kumar");
    expect(res.customers).toEqual([]);
    expect(res.orders).toHaveLength(1);
  });
});
