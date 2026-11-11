import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  assertOrderVisible: vi.fn(),
  currentUserId: vi.fn(),
  values: vi.fn(),
  limit: vi.fn(),
  revalidateOrder: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({
  requirePermission: m.requirePermission,
  requireAdmin: vi.fn(),
  requireStaff: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({}) }));
vi.mock("@/lib/auth/visible-orgs", () => ({ resolveSessionVisibleOrgIds: async () => "all" }));
vi.mock("@/lib/services/orders.service", () => ({ assertOrderVisible: m.assertOrderVisible, ordersService: {} }));
vi.mock("@/lib/services/session-service", async (importOriginal) => ({ ...(await importOriginal<object>()), currentUserId: m.currentUserId }));
vi.mock("@/lib/revalidate", () => ({ revalidateOrder: m.revalidateOrder }));
vi.mock("@/db/client", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: m.limit }) }) }),
    insert: () => ({ values: m.values }),
  },
}));
const actions = await import("../actions");
beforeEach(() => {
  vi.clearAllMocks();
  m.limit.mockResolvedValue([{ id: 11n, organizationId: null }]);
  m.values.mockResolvedValue(undefined);
  m.currentUserId.mockResolvedValue(7n);
});
describe("addOrderNoteAction", () => {
  it("requires order write and visibility before writing", async () => {
    await actions.addOrderNoteAction("ord_1", "Called, customer will pay today");
    expect(m.requirePermission).toHaveBeenCalledWith({ order: ["write"] });
    expect(m.assertOrderVisible).toHaveBeenCalledWith("ord_1", "all");
    expect(m.assertOrderVisible.mock.invocationCallOrder[0]).toBeLessThan(m.values.mock.invocationCallOrder[0]);
  });
  it("writes a note activity trimmed, authored from the session", async () => {
    const res = await actions.addOrderNoteAction("ord_1", "  Called, will pay today  ");
    expect(res).toEqual({ ok: true });
    expect(m.values).toHaveBeenCalledWith(expect.objectContaining({ orderId: 11n, type: "note", note: "Called, will pay today", createdBy: 7n }));
  });
  it("rejects an empty note without writing", async () => {
    const res = await actions.addOrderNoteAction("ord_1", "   ");
    expect(res).toHaveProperty("error");
    expect(m.values).not.toHaveBeenCalled();
  });
  it("rejects a note over 2000 characters without writing", async () => {
    const res = await actions.addOrderNoteAction("ord_1", "x".repeat(2001));
    expect(res).toHaveProperty("error");
    expect(m.values).not.toHaveBeenCalled();
  });
});
