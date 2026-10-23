import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@foundry/commons";

const m = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createOrder: vi.fn(),
  loadRenewContext: vi.fn(),
  findUnpaidRenewal: vi.fn(),
  loadQuickRenewForOrder: vi.fn(),
  assertOrderVisible: vi.fn(),
  loadRenewSourceSelections: vi.fn(),
  methods: vi.fn(),
  defaultMethod: vi.fn(),
}));
vi.mock("@/lib/payments/stripe", () => ({ stripePayLink: async (id: string) => `https://pay/${id}` }));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: m.requirePermission }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "usr_staff" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/services/orders.service", () => ({
  createOrder: m.createOrder,
  assertOrderVisible: m.assertOrderVisible,
  assertOnePerson: (i: { selections: { persons: number } }) => { if (i.selections.persons !== 1) throw new ValidationError("one person"); },
  resolveSessionVisibleOrgIds: async () => "all",
}));
vi.mock("@/lib/services/quick-renew.service", () => ({
  defaultPaymentMethodId: m.defaultMethod,
  loadRenewContext: m.loadRenewContext,
  findUnpaidRenewal: m.findUnpaidRenewal,
  loadQuickRenewForOrder: m.loadQuickRenewForOrder,
  loadRenewSourceSelections: m.loadRenewSourceSelections,
}));

const { renewOrderAction } = await import("../renew-actions");

const SRC = {
  planKey: "veg", status: "active", organizationId: "org_1", trialLength: null, sourceMethodId: "etransfer", ownerPublicId: "usr_owner", ownerName: "Asha",
  email: "a@x.ca", phone: "+14165550101", fullName: "Asha", addressLine: "1 Main", city: "Toronto", postalCode: "M5V1A1", addressPublicId: "adr_1",
};
const input = { orderPublicId: "ord_1", selections: { planKey: "hacked" } as never, addressPublicId: "adr_2" };

beforeEach(() => {
  vi.resetAllMocks();
  m.requirePermission.mockResolvedValue(undefined);
  m.assertOrderVisible.mockResolvedValue(undefined);
  m.loadRenewContext.mockResolvedValue(SRC);
  m.findUnpaidRenewal.mockResolvedValue(null);
  m.loadRenewSourceSelections.mockResolvedValue({ planKey: "veg", mealSizeId: "ms_src", frequencyKey: "daily", eatingDays: ["mon"], persons: 1, mealSlots: [], includeSaturday: false, includeSunday: false, durationWeeks: 4, startDate: "2026-11-01", addonSelections: [] });
  m.defaultMethod.mockResolvedValue("stripe");
  m.createOrder.mockResolvedValue({ publicId: "ord_2", deploymentId: "SUB-1", paymentPublicId: "pay_1" });
});

describe("renewOrderAction", () => {
  it("returns an error and never creates when permission is rejected", async () => {
    m.requirePermission.mockRejectedValue(new Error("nope"));
    const res = await renewOrderAction(input);
    expect("error" in res).toBe(true);
    expect(m.createOrder).not.toHaveBeenCalled();
  });

  it("refuses while an unpaid renewal exists and never creates", async () => {
    m.findUnpaidRenewal.mockResolvedValue({ publicId: "ord_9", deploymentId: "SUB-9" });
    expect(await renewOrderAction(input)).toEqual({ error: "This customer already has a renewal waiting for payment. Open it to resend the pay link or cancel it." });
    expect(m.createOrder).not.toHaveBeenCalled();
  });

  it("takes planKey from the source order, not the client", async () => {
    await renewOrderAction({ ...input, selections: { planKey: "hacked" } as never });
    expect(m.createOrder.mock.calls[0][0].planKey).toBe("veg");
    expect(m.createOrder.mock.calls[0][0].addressPublicId).toBe("adr_2");
  });

  it("takes plan, size, days and persons from the source, only picks from the client", async () => {
    const hostile = { planKey: "x", mealSizeId: "ms_evil", frequencyKey: "f", eatingDays: ["sun"], persons: 4, mealSlots: ["a"], includeSaturday: true, includeSunday: true, trialDays: 3, startDate: "2026-12-01", durationWeeks: 8, addonSelections: [{ key: "k", qty: 1 }] } as never;
    await renewOrderAction({ ...input, selections: hostile });
    const sel = m.createOrder.mock.calls[0][0].selections;
    expect(sel).toMatchObject({ mealSizeId: "ms_src", persons: 1, includeSaturday: false, includeSunday: false, eatingDays: ["mon"], mealSlots: [], frequencyKey: "daily", startDate: "2026-12-01", durationWeeks: 8, addonSelections: [{ key: "k", qty: 1 }] });
    expect(sel.trialDays).toBeUndefined();
  });

  it("errors inline when the source can't be rebuilt", async () => {
    m.loadRenewSourceSelections.mockResolvedValue(null);
    expect(await renewOrderAction(input)).toEqual({ error: "This plan can't be quick-renewed. Use New order." });
    expect(m.createOrder).not.toHaveBeenCalled();
  });

  it("passes the shared default rail, seeded with the source order's method", async () => {
    m.defaultMethod.mockResolvedValue("etransfer");
    await renewOrderAction(input);
    expect(m.defaultMethod).toHaveBeenCalledWith("etransfer");
    expect(m.createOrder.mock.calls[0][0].paymentMethodId).toBe("etransfer");
  });

  it("refuses a source order that is not active, paused or completed", async () => {
    m.loadRenewContext.mockResolvedValue({ ...SRC, status: "cancelled" });
    expect("error" in (await renewOrderAction(input))).toBe(true);
    expect(m.createOrder).not.toHaveBeenCalled();
  });

  it("returns the overlap ValidationError as a result", async () => {
    m.createOrder.mockRejectedValue(new ValidationError("overlaps"));
    const res = await renewOrderAction(input);
    expect(res).toEqual({ error: "overlaps" });
  });

  it("creates as staff for the source owner and returns the pay link", async () => {
    const res = await renewOrderAction(input);
    expect(m.createOrder.mock.calls[0][1]).toMatchObject({ staffCreated: true, ownerUserId: "usr_owner", actorId: "usr_staff" });
    expect(res).toMatchObject({ ok: true, publicId: "ord_2", payUrl: "https://pay/pay_1" });
  });
});
