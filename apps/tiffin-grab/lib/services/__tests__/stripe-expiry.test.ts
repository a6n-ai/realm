import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const status = vi.fn();
const retrieve = vi.fn();
const cancel = vi.fn(async () => ({}));
vi.mock("@/lib/payments/stripe", async (orig) => ({
  ...(await orig<object>()),
  stripeRuntime: async () => ({
    stripe: { paymentIntents: { cancel, retrieve: (...a: unknown[]) => retrieve(...a) } },
    cfg: { surcharge: { enabled: false, ratePct: 0, excludeProvinces: [], networksNotifiedOn: "2026-09-01" }, tax: { enabled: false, taxCode: "txcd_x", surchargeTaxable: false } },
  }),
}));
vi.mock("@foundry/payments/stripe", async (orig) => ({ ...(await orig<object>()), fetchIntentStatus: (...a: unknown[]) => status(...a) }));

const { db } = await import("@/db/client");
const { deliveries, orders, payments } = await import("@/db/schema");
const { createOrder, listOrdersPage } = await import("../orders.service");
const { settleStripePayment, payByCard } = await import("../payment-stripe");
const { expireUnpaidStripeOrders, cancelOpenIntent } = await import("../stripe-expiry");
const { setPaymentConfig } = await import("../app-settings.service");
const { sharedCache } = await import("@/lib/cache");
const { baseInput, reset, cleanup } = await import("./stripe-fixture");

async function load(publicId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));
  return { order: order!, pay: pay! };
}
const expire = (id: bigint) => db.update(payments).set({ expiresAt: Date.now() - 1 }).where(eq(payments.id, id));
const intent = (st: string) => retrieve.mockResolvedValue({ status: st, latest_charge: null });

describe("unpaid Stripe orders expire", () => {
  beforeEach(async () => {
    await reset();
    await setPaymentConfig({
      methods: [
        { id: "etransfer", kind: "manual", enabled: true, label: "e-Transfer", payeeHandle: "p@x.ca", taxes: [] },
        { id: "stripe", kind: "online", enabled: true, label: "Card", taxes: [] },
      ],
    });
    await sharedCache("app-settings").evictAll();
    status.mockReset();
    retrieve.mockReset();
    retrieve.mockResolvedValue({ status: "succeeded", latest_charge: null });
    cancel.mockClear();
  });
  afterAll(cleanup);

  it("cancels a pending Stripe order past its expiry", async () => {
    const { publicId } = await createOrder(await baseInput({ paymentMethodId: "stripe" }));
    const r = await load(publicId);
    expect(await expireUnpaidStripeOrders({ userId: r.order.userId! })).toBe(0);
    await expire(r.pay.id);
    expect(await expireUnpaidStripeOrders({ userId: r.order.userId! })).toBe(1);
    expect((await load(publicId)).order.status).toBe("cancelled");
  });

  it("cancels the open intent and leaves in-flight ones alone", async () => {
    const { publicId } = await createOrder(await baseInput({ paymentMethodId: "stripe" }));
    const r = await load(publicId);
    await db.update(payments).set({ providerRef: "pi_1" }).where(eq(payments.id, r.pay.id));
    await expire(r.pay.id);
    for (const st of ["processing", "succeeded", "requires_capture"]) {
      intent(st);
      expect(await expireUnpaidStripeOrders({})).toBe(0);
      expect((await load(publicId)).order.status).toBe("pending");
    }
    expect(cancel).not.toHaveBeenCalled();
    intent("requires_payment_method");
    expect(await expireUnpaidStripeOrders({})).toBe(1);
    expect(cancel).toHaveBeenCalledWith("pi_1");
    expect((await load(publicId)).order.status).toBe("cancelled");
  });

  it("does not cancel an order it cannot verify", async () => {
    retrieve.mockRejectedValue(new Error("network"));
    expect(await cancelOpenIntent("pi_1")).toBe("in_flight");
  });

  it("does not touch wc- migrated pending orders or e-Transfer orders", async () => {
    const wc = await createOrder(await baseInput({ paymentMethodId: "stripe" }));
    const wcRow = await load(wc.publicId);
    await db.update(orders).set({ deploymentId: "wc-1" }).where(eq(orders.id, wcRow.order.id));
    await expire(wcRow.pay.id);
    const et = await createOrder(await baseInput({ paymentMethodId: "etransfer" }));
    const etRow = await load(et.publicId);
    await db.update(orders).set({ status: "pending" }).where(eq(orders.id, etRow.order.id));
    await expire(etRow.pay.id);
    expect(await expireUnpaidStripeOrders({})).toBe(0);
    expect((await load(wc.publicId)).order.status).toBe("pending");
    expect((await load(et.publicId)).order.status).toBe("pending");
  });

  it("leaves an order alone while its charge lock is held (mid-charge)", async () => {
    const { publicId } = await createOrder(await baseInput({ paymentMethodId: "stripe" }));
    const r = await load(publicId);
    await expire(r.pay.id);
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    let locked!: () => void;
    const held = new Promise<void>((res) => (locked = res));
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"stripe-charge:" + r.pay.publicId}, 0))`);
      locked();
      await gate;
    });
    await held;
    expect(await expireUnpaidStripeOrders({})).toBe(0);
    release();
    await holder;
    expect((await load(publicId)).order.status).toBe("pending");
    expect(await expireUnpaidStripeOrders({})).toBe(1);
  });

  it("leaves an in-flight older order alone when replacing", async () => {
    const input = await baseInput({ paymentMethodId: "stripe" });
    const first = await createOrder(input);
    await db.update(payments).set({ providerRef: "pi_1" }).where(eq(payments.id, (await load(first.publicId)).pay.id));
    intent("processing");
    await createOrder(input);
    expect((await load(first.publicId)).order.status).toBe("pending");
  });

  it("keeps the older order when the new checkout fails", async () => {
    const input = await baseInput({ paymentMethodId: "stripe" });
    const first = await createOrder(input);
    await expect(createOrder({ ...input, couponCode: "NO-SUCH-COUPON" })).rejects.toThrow();
    expect((await load(first.publicId)).order.status).toBe("pending");
  });

  it("does not replace the customer's older order for a staff-created one", async () => {
    const input = await baseInput({ paymentMethodId: "stripe" });
    const first = await createOrder(input);
    await createOrder(input, { staffCreated: true, allowSameDayStart: true });
    expect((await load(first.publicId)).order.status).toBe("pending");
  });

  it("replaces an older unpaid Stripe order on a new checkout", async () => {
    const input = await baseInput({ paymentMethodId: "stripe" });
    const first = await createOrder(input);
    const second = await createOrder({ ...input, selections: { ...input.selections } });
    expect((await load(first.publicId)).order.status).toBe("cancelled");
    expect((await load(second.publicId)).order.status).toBe("pending");
  });

  it("does not count an unpaid Stripe order as a renewal", async () => {
    const input = await baseInput({ paymentMethodId: "etransfer" });
    const a = await createOrder(input);
    const aRow = await load(a.publicId);
    const [{ last }] = await db.select({ last: sql<string>`max(${deliveries.deliveryDate})` }).from(deliveries).where(eq(deliveries.orderId, aRow.order.id));
    const start = new Date(`${input.selections.startDate}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() + 14);
    const b = await createOrder({ ...input, paymentMethodId: "stripe", selections: { ...input.selections, startDate: start.toISOString().slice(0, 10) } });
    const ending = async () => (await listOrdersPage(undefined, { page: 0, size: 10 }, undefined, "all", { ending: { from: last, to: last } })).items.find((r) => r.publicId === a.publicId)!;
    expect((await ending()).renewed).toBe(false);

    const bRow = await load(b.publicId);
    await db.update(payments).set({ providerRef: "pi_1" }).where(eq(payments.id, bRow.pay.id));
    status.mockResolvedValue({ piId: "pi_1", status: "succeeded", amountReceivedCents: Math.round(Number(bRow.pay.amount) * 100), currency: "cad", paymentRef: bRow.pay.publicId, created: 1 });
    expect(await settleStripePayment({ paymentRef: bRow.pay.publicId }, "webhook", "evt_1")).toBe("paid");
    expect((await ending()).renewed).toBe(true);
  });

  it("refuses to pay an expired link", async () => {
    const { publicId } = await createOrder(await baseInput({ paymentMethodId: "stripe" }));
    const r = await load(publicId);
    await expire(r.pay.id);
    const [{ ref }] = await db.execute(sql`select public_id as ref from users where id = ${r.order.userId}`) as unknown as { ref: string }[];
    await expect(payByCard({ paymentPublicId: r.pay.publicId, userPublicId: ref, confirmationTokenId: "ct", acceptSurcharge: false, returnUrl: "u" }))
      .rejects.toThrow("This payment link has expired");
  });
});
