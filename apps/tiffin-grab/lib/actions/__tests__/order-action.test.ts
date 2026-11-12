import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@foundry/commons";

const m = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  requireAdmin: vi.fn(),
  visible: vi.fn(),
  assertOrderVisible: vi.fn(),
  assertDeliveryVisible: vi.fn(),
  assertPaymentVisible: vi.fn(),
  revalidateOrder: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireStaff: m.requireStaff, requireAdmin: m.requireAdmin }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "usr_staff" } }) }));
vi.mock("@/lib/auth/visible-orgs", () => ({ resolveSessionVisibleOrgIds: m.visible }));
vi.mock("@/lib/revalidate", () => ({ revalidateOrder: m.revalidateOrder }));
vi.mock("@/lib/services/orders.service", () => ({
  assertOrderVisible: m.assertOrderVisible,
  assertDeliveryVisible: m.assertDeliveryVisible,
  assertPaymentVisible: m.assertPaymentVisible,
}));

const { orderAction, assertOrderAccess } = await import("../order-action");

beforeEach(() => {
  vi.resetAllMocks();
  m.visible.mockResolvedValue(["org_mine"]);
});

describe("orderAction", () => {
  it("refuses an order outside the caller's organizations without running the action or revalidating", async () => {
    m.assertOrderVisible.mockRejectedValue(new NotFoundError("Order not found"));
    const fn = vi.fn();
    const res = await orderAction({ order: "ord_other", orderPage: "ord_other" }, fn);
    expect(res).toMatchObject({ error: "Order not found" });
    expect(m.assertOrderVisible).toHaveBeenCalledWith("ord_other", ["org_mine"]);
    expect(fn).not.toHaveBeenCalled();
    expect(m.revalidateOrder).not.toHaveBeenCalled();
  });

  it("checks every id it is given with one visibility read, then runs and revalidates", async () => {
    const res = await orderAction({ order: "ord_1", payment: "pay_1", orderPage: "ord_1", reach: { payments: true } }, async () => "done");
    expect(res).toEqual({ ok: true, message: "done" });
    expect(m.visible).toHaveBeenCalledTimes(1);
    expect(m.assertPaymentVisible).toHaveBeenCalledWith("pay_1", ["org_mine"]);
    expect(m.revalidateOrder).toHaveBeenCalledWith("ord_1", { payments: true });
  });

  it("uses the admin guard for admin actions and stops before visibility when it fails", async () => {
    m.requireAdmin.mockRejectedValue(new Error("Forbidden"));
    await expect(assertOrderAccess({ delivery: "dlv_1" }, "admin")).rejects.toThrow("Forbidden");
    expect(m.requireStaff).not.toHaveBeenCalled();
    expect(m.assertDeliveryVisible).not.toHaveBeenCalled();
  });
});
