import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@foundry/commons";

const m = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createOrder: vi.fn(),
  loadRenewContext: vi.fn(),
  loadQuickRenewForOrder: vi.fn(),
  assertOrderVisible: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: m.requirePermission }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "usr_staff" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/payments/stripe", () => ({ stripePayLink: async (id: string) => `https://pay/${id}` }));
vi.mock("@/lib/services/orders.service", () => ({
  createOrder: m.createOrder,
  assertOrderVisible: m.assertOrderVisible,
  resolveSessionVisibleOrgIds: async () => "all",
}));
vi.mock("@/lib/services/quick-renew.service", () => ({
  loadRenewContext: m.loadRenewContext,
  loadQuickRenewForOrder: m.loadQuickRenewForOrder,
}));

const { renewOrderAction } = await import("../renew-actions");

const SRC = {
  planKey: "veg", organizationId: "org_1", trialLength: null, ownerPublicId: "usr_owner", ownerName: "Asha",
  email: "a@x.ca", phone: "+14165550101", fullName: "Asha", addressLine: "1 Main", city: "Toronto", postalCode: "M5V1A1", addressPublicId: "adr_1",
};
const input = { orderPublicId: "ord_1", selections: { planKey: "hacked" } as never, addressPublicId: "adr_2" };

beforeEach(() => {
  vi.resetAllMocks();
  m.requirePermission.mockResolvedValue(undefined);
  m.assertOrderVisible.mockResolvedValue(undefined);
  m.loadRenewContext.mockResolvedValue(SRC);
  m.createOrder.mockResolvedValue({ publicId: "ord_2", deploymentId: "SUB-1", paymentPublicId: "pay_1" });
});

describe("renewOrderAction", () => {
  it("returns an error and never creates when permission is rejected", async () => {
    m.requirePermission.mockRejectedValue(new Error("nope"));
    const res = await renewOrderAction(input);
    expect("error" in res).toBe(true);
    expect(m.createOrder).not.toHaveBeenCalled();
  });

  it("takes planKey from the source order, not the client", async () => {
    await renewOrderAction({ ...input, selections: { planKey: "hacked" } as never });
    expect(m.createOrder.mock.calls[0][0].planKey).toBe("veg");
    expect(m.createOrder.mock.calls[0][0].addressPublicId).toBe("adr_2");
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
