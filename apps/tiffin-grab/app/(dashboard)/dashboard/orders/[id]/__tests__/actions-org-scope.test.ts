// Every order action refuses an order outside the caller's organizations before it does
// anything. Delivery and payment actions are checked by that row's own order, because the
// order id they also take is only used to refresh the page.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@foundry/commons";

const svc = vi.hoisted(() => ({
  activateOrder: vi.fn(), cancelOrder: vi.fn(), startMigratedOrder: vi.fn(), changeOrderStartDate: vi.fn(),
  changeOrderEatingDays: vi.fn(), changeMealSize: vi.fn(), rejectPayment: vi.fn(), updatePaymentReference: vi.fn(),
  verifyPayment: vi.fn(), assertOrderVisible: vi.fn(), assertDeliveryVisible: vi.fn(), assertPaymentVisible: vi.fn(),
  resolveSessionVisibleOrgIds: vi.fn(),
  sendPaymentReminder: vi.fn(),
  adminSetDeliveryStatus: vi.fn(), grantComplimentaryTiffin: vi.fn(), redeliverTrip: vi.fn(),
  pushOneDelivery: vi.fn(), removeOneDelivery: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireStaff: async () => {}, requireAdmin: async () => {} }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "usr_staff" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@foundry/realtime/server", () => ({ memoryBus: { publish: () => {} } }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/services/orders.service", () => svc);
vi.mock("@/lib/services/session-service", () => ({ currentUserId: async () => 7n }));
vi.mock("@/lib/services/payment-reminder", () => ({ sendPaymentReminder: svc.sendPaymentReminder }));
vi.mock("@/lib/services/deliveries.service", () => ({
  adminSetDeliveryStatus: svc.adminSetDeliveryStatus, grantComplimentaryTiffin: svc.grantComplimentaryTiffin,
  redeliverTrip: svc.redeliverTrip, isAdminDeliveryStatus: () => true,
}));
vi.mock("@/lib/services/optimoroute/push", () => ({ pushOneDelivery: svc.pushOneDelivery, removeOneDelivery: svc.removeOneDelivery }));

const actions = await import("../actions");

const ORDER = "ord_other_org";
const DELIVERY = "dlv_other_org";
const PAYMENT = "pay_other_org";
const VISIBLE = ["org_mine"];

beforeEach(() => {
  vi.clearAllMocks();
  svc.resolveSessionVisibleOrgIds.mockResolvedValue(VISIBLE);
  for (const guard of [svc.assertOrderVisible, svc.assertDeliveryVisible, svc.assertPaymentVisible]) {
    guard.mockRejectedValue(new NotFoundError("Order not found"));
  }
});

// An action either throws or returns { error }; both count as refused.
const refused = async (call: () => Promise<unknown>) => {
  const res = await call().catch((e: unknown) => ({ error: String(e) }));
  expect(res).toHaveProperty("error");
};

describe("order actions outside the caller's organizations", () => {
  it.each([
    ["activate", () => actions.activate(ORDER), svc.activateOrder],
    ["startMigrated", () => actions.startMigrated(ORDER, "2030-01-07"), svc.startMigratedOrder],
    ["changeStartDateAction", () => actions.changeStartDateAction(ORDER, "2030-01-07"), svc.changeOrderStartDate],
    ["changeEatingDaysAction", () => actions.changeEatingDaysAction(ORDER, ["mon"]), svc.changeOrderEatingDays],
    ["cancel", () => actions.cancel(ORDER), svc.cancelOrder],
    ["changePlan", () => actions.changePlan(ORDER, "msz_1"), svc.changeMealSize],
    ["updatePaymentReferenceAction", () => actions.updatePaymentReferenceAction(ORDER, PAYMENT, "ref"), svc.updatePaymentReference],
    ["sendPaymentReminderAction", () => actions.sendPaymentReminderAction(ORDER, PAYMENT), svc.sendPaymentReminder],
    ["grantComplimentaryAction", () => actions.grantComplimentaryAction(ORDER, { date: "2030-01-07", note: "x", notify: false }), svc.grantComplimentaryTiffin],
  ] as const)("%s checks the order", async (_name, call, service) => {
    await refused(call);
    expect(svc.assertOrderVisible).toHaveBeenCalledWith(ORDER, VISIBLE);
    expect(service).not.toHaveBeenCalled();
  });

  it.each([
    ["verifyPaymentAction", () => actions.verifyPaymentAction("ord_mine", PAYMENT), svc.verifyPayment],
    ["rejectPaymentAction", () => actions.rejectPaymentAction("ord_mine", PAYMENT, "no"), svc.rejectPayment],
  ] as const)("%s checks the payment's own order, not the order id sent with it", async (_name, call, service) => {
    await refused(call);
    expect(svc.assertPaymentVisible).toHaveBeenCalledWith(PAYMENT, VISIBLE);
    expect(service).not.toHaveBeenCalled();
  });

  it.each([
    ["pushDeliveryToOptimoAction", () => actions.pushDeliveryToOptimoAction("ord_mine", DELIVERY, "2030-01-07"), svc.pushOneDelivery],
    ["removeDeliveryFromOptimoAction", () => actions.removeDeliveryFromOptimoAction("ord_mine", DELIVERY, "2030-01-07"), svc.removeOneDelivery],
    ["setDeliveryStatusAction", () => actions.setDeliveryStatusAction(DELIVERY, "delivered"), svc.adminSetDeliveryStatus],
    ["redeliverTripAction", () => actions.redeliverTripAction("ord_mine", DELIVERY), svc.redeliverTrip],
  ] as const)("%s checks the delivery's own order, not the order id sent with it", async (_name, call, service) => {
    await refused(call);
    expect(svc.assertDeliveryVisible).toHaveBeenCalledWith(DELIVERY, VISIBLE);
    expect(service).not.toHaveBeenCalled();
  });
});
