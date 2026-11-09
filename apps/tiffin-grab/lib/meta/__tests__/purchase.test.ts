import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, ne } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const sendMetaEventAwait = vi.fn(async (_args: unknown) => undefined);
vi.mock("../capi", () => ({
  sendMetaEvent: vi.fn(),
  sendMetaEventAwait: (args: unknown) => sendMetaEventAwait(args),
}));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, notificationOutbox, orderActivities, orders, payments, users } = await import("@/db/schema");
const { createOrder } = await import("@/lib/services/orders.service");
const { claimPayment, verifyPayment } = await import("@/lib/payments/verification");
const { setPaymentConfig } = await import("@/lib/services/app-settings.service");
const { sharedCache } = await import("@/lib/cache");
const { baseInput } = await import("@/lib/services/__tests__/stripe-fixture");
const { sendMetaPurchaseOnce } = await import("../purchase");

async function reset() {
  sendMetaEventAwait.mockClear();
  await db.delete(ledgerEntries);
  await db.delete(deliveries);
  await db.delete(payments);
  await db.delete(orderActivities);
  await db.delete(orders);
  await db
    .delete(notificationOutbox)
    .where(inArray(notificationOutbox.recipientId, db.select({ id: users.id }).from(users).where(ne(users.isSystem, true))));
  await db.delete(users).where(ne(users.isSystem, true));
  await setPaymentConfig({ methods: [] });
  await sharedCache("app-settings").evictAll();
}

describe("sendMetaPurchaseOnce", () => {
  beforeEach(reset);
  afterAll(reset);

  async function etransferOrder(phone: string) {
    await setPaymentConfig({
      methods: [
        {
          id: "etransfer",
          kind: "manual",
          enabled: true,
          label: "Interac e-Transfer",
          payeeHandle: "pay@test.ca",
          requireProof: false,
          taxes: [],
        },
      ],
    });
    await sharedCache("app-settings").evictAll();
    const { deploymentId } = await createOrder(await baseInput({ paymentMethodId: "etransfer", phone }));
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));
    return pay!;
  }

  it("skips awaiting_payment and pending_verification; Purchase only on paid verify; idempotent", async () => {
    const pay = await etransferOrder("+16475550101");
    expect(pay.status).toBe("awaiting_payment");

    await sendMetaPurchaseOnce(pay.publicId);
    expect(sendMetaEventAwait).not.toHaveBeenCalled();
    const [still] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(still!.metaPurchaseSentAt).toBeNull();

    await claimPayment(pay.publicId, { reference: "CLAIM-1" });
    // claim fires order_submitted, not Purchase
    expect(sendMetaEventAwait).toHaveBeenCalledTimes(1);
    expect(sendMetaEventAwait.mock.calls.at(0)?.at(0)).toMatchObject({
      eventName: "order_submitted",
      eventId: `order_submitted:${pay.publicId}`,
    });
    const [claimed] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(claimed!.status).toBe("pending_verification");
    expect(claimed!.metaPurchaseSentAt).toBeNull();

    sendMetaEventAwait.mockClear();
    await sendMetaPurchaseOnce(pay.publicId);
    expect(sendMetaEventAwait).not.toHaveBeenCalled();

    await verifyPayment(pay.publicId);
    // verify schedules Purchase in the background; await the helper to assert settle + stamp.
    await sendMetaPurchaseOnce(pay.publicId);
    expect(sendMetaEventAwait).toHaveBeenCalledTimes(1);
    expect(sendMetaEventAwait.mock.calls.at(0)?.at(0)).toMatchObject({
      eventName: "Purchase",
      eventId: pay.publicId,
      customData: expect.objectContaining({ currency: "CAD", order_id: expect.any(String) }),
    });

    const [paid] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(paid!.status).toBe("paid");
    expect(paid!.metaPurchaseSentAt).toBeTypeOf("number");
    const sentAt = paid!.metaPurchaseSentAt;

    sendMetaEventAwait.mockClear();
    await sendMetaPurchaseOnce(pay.publicId);
    expect(sendMetaEventAwait).not.toHaveBeenCalled();
    const [again] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(again!.metaPurchaseSentAt).toBe(sentAt);
  });

  it("skips renewals (metaPurchaseEligible = false) on verify", async () => {
    const pay = await etransferOrder("+16475550102");
    await db.update(orders).set({ metaPurchaseEligible: false }).where(eq(orders.id, pay.orderId));
    await claimPayment(pay.publicId, { reference: "RENEW-SKIP" });
    // order_submitted still fires for renewals (funnel); Purchase must not
    expect(sendMetaEventAwait).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "order_submitted" }),
    );
    sendMetaEventAwait.mockClear();

    await verifyPayment(pay.publicId);
    await sendMetaPurchaseOnce(pay.publicId);
    expect(sendMetaEventAwait).not.toHaveBeenCalled();
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row!.metaPurchaseSentAt).toBeNull();
  });
});
