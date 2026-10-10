import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, ne } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { couponRedemptions, coupons, deliveries, ledgerEntries, notificationOutbox, orderActivities, orders, payments, users, walletLedger } =
  await import("@/db/schema");
const { createOrder, verifyPayment, claimPayment } = await import("../orders.service");
const { setPaymentConfig } = await import("../app-settings.service");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { sharedCache } = await import("@/lib/cache");
const { baseInput } = await import("./stripe-fixture");

type Snapshot = {
  subtotal: number;
  total: number;
  taxTotal: number;
  paymentMethodId: string;
  pendingRedemptions?: { code: string; amount: number }[];
};

async function reset() {
  await db.delete(walletLedger);
  await db.delete(ledgerEntries);
  await db.delete(couponRedemptions);
  await db.delete(coupons);
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

describe("createOrder payment deferral", () => {
  beforeEach(reset);
  afterAll(reset);

  it("simulated mode (no methods): immediate ledger credit + coupon redeem", async () => {
    await db.insert(coupons).values({
      code: "SIM10",
      kind: "fixed",
      name: "Sim 10",
      valueAmount: "10",
      maxRedemptions: 5,
    });

    const { deploymentId, publicId } = await createOrder(await baseInput({ couponCode: "SIM10" }));
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));

    expect(pay!.status).toBe("simulated_paid");
    expect(pay!.method).toBe("simulated");

    const paymentLed = await db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.orderId, order!.id), eq(ledgerEntries.type, "payment")));
    expect(paymentLed).toHaveLength(1);

    const reds = await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, order!.id));
    expect(reds).toHaveLength(1);

    const snap = order!.pricingSnapshot as Snapshot;
    expect(snap.pendingRedemptions).toBeUndefined();
    expect(publicId).toBeTruthy();
  });

  it("rails enabled: a missing or simulated method is rejected, never a free paid order", async () => {
    await setPaymentConfig({
      methods: [{ id: "etransfer", kind: "manual", enabled: true, label: "Interac e-Transfer", taxes: [] }],
    });
    await sharedCache("app-settings").evictAll();

    await expect(createOrder(await baseInput())).rejects.toThrow("Choose a payment method");
    await expect(createOrder(await baseInput({ paymentMethodId: "simulated" }))).rejects.toThrow("Choose a payment method");
    expect(await db.select().from(payments)).toHaveLength(0);
  });

  it("no rails in production: refuses instead of simulating", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      await expect(createOrder(await baseInput())).rejects.toThrow("Payments aren't set up yet");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("real method: awaiting_payment, no ledger/coupon yet; verify settles all", async () => {
    await setPaymentConfig({
      methods: [
        {
          id: "etransfer",
          kind: "manual",
          enabled: true,
          label: "Interac e-Transfer",
          payeeHandle: "pay@test.ca",
          taxes: [{ name: "GST", ratePct: 5 }],
        },
      ],
    });
    await sharedCache("app-settings").evictAll();

    await db.insert(coupons).values({
      code: "ET10",
      kind: "fixed",
      name: "ET 10",
      valueAmount: "10",
      maxRedemptions: 5,
      allowedPaymentMethods: ["etransfer"],
    });

    const { deploymentId } = await createOrder(
      await baseInput({ couponCode: "ET10", paymentMethodId: "etransfer", phone: "+16475550888" }),
    );
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));

    expect(order!.status).toBe("active");
    expect(pay!.status).toBe("awaiting_payment");
    expect(pay!.method).toBe("etransfer");

    const snap = order!.pricingSnapshot as Snapshot;
    expect(snap.paymentMethodId).toBe("etransfer");
    expect(snap.taxTotal).toBeGreaterThan(0);
    expect(snap.pendingRedemptions).toHaveLength(1);
    expect(snap.pendingRedemptions![0]!.code).toBe("ET10");

    // Nothing settled yet.
    expect(
      await db.select().from(ledgerEntries).where(eq(ledgerEntries.orderId, order!.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, order!.id)),
    ).toHaveLength(0);

    await verifyPayment(pay!.publicId);

    const [afterPay] = await db.select().from(payments).where(eq(payments.id, pay!.id));
    expect(afterPay!.status).toBe("paid");
    expect(afterPay!.capturedAt).toBeTypeOf("number");

    const paymentLed = await db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.orderId, order!.id), eq(ledgerEntries.type, "payment")));
    expect(paymentLed).toHaveLength(1);
    expect(paymentLed[0]!.amount).toBe(order!.total);

    const discountLed = await db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.orderId, order!.id), eq(ledgerEntries.type, "discount")));
    expect(discountLed).toHaveLength(1);

    const reds = await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, order!.id));
    expect(reds).toHaveLength(1);

    const [afterOrder] = await db.select().from(orders).where(eq(orders.id, order!.id));
    const afterSnap = afterOrder!.pricingSnapshot as Snapshot;
    expect(afterSnap.pendingRedemptions).toBeUndefined();
  });

  it("claimPayment: reference alone → pending_verification; requireProof forces screenshot", async () => {
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

    const { deploymentId } = await createOrder(
      await baseInput({ paymentMethodId: "etransfer", phone: "+16475550777" }),
    );
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));

    await expect(claimPayment(pay!.publicId, {})).rejects.toThrow(/reference or upload/i);

    await claimPayment(pay!.publicId, { reference: "INTERAC-123" });
    const [claimed] = await db.select().from(payments).where(eq(payments.id, pay!.id));
    expect(claimed!.status).toBe("pending_verification");
    expect(claimed!.reference).toBe("INTERAC-123");
    expect(claimed!.claimedAt).toBeTypeOf("number");

    // requireProof method rejects a reference-only claim.
    await setPaymentConfig({
      methods: [
        {
          id: "etransfer",
          kind: "manual",
          enabled: true,
          label: "Interac e-Transfer",
          payeeHandle: "pay@test.ca",
          requireProof: true,
          taxes: [],
        },
      ],
    });
    await sharedCache("app-settings").evictAll();

    const { deploymentId: d2 } = await createOrder(
      await baseInput({ paymentMethodId: "etransfer", phone: "+16475550666" }),
    );
    const [o2] = await db.select().from(orders).where(eq(orders.deploymentId, d2));
    const [p2] = await db.select().from(payments).where(eq(payments.orderId, o2!.id));
    await expect(claimPayment(p2!.publicId, { reference: "X" })).rejects.toThrow(/screenshot is required/i);

    await claimPayment(p2!.publicId, {
      reference: "X",
      proof: { path: "payments/x/orig.png", thumbUrl: "https://x/thumb.png", name: "shot.png" },
    });
    const [p2After] = await db.select().from(payments).where(eq(payments.id, p2!.id));
    expect(p2After!.status).toBe("pending_verification");
    expect(p2After!.proof).toEqual({
      path: "payments/x/orig.png",
      thumbUrl: "https://x/thumb.png",
      name: "shot.png",
    });
  });

  it("rejected → re-claim clears the reject note", async () => {
    await setPaymentConfig({
      methods: [
        {
          id: "cash",
          kind: "manual",
          enabled: true,
          label: "Cash",
          payeeHandle: "driver",
          taxes: [],
        },
      ],
    });
    await sharedCache("app-settings").evictAll();

    const { deploymentId } = await createOrder(
      await baseInput({ paymentMethodId: "cash", phone: "+16475550555" }),
    );
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));

    await db
      .update(payments)
      .set({ status: "rejected", note: "Wrong amount" })
      .where(eq(payments.id, pay!.id));

    await claimPayment(pay!.publicId, { reference: "CASH-OK" });
    const [after] = await db.select().from(payments).where(eq(payments.id, pay!.id));
    expect(after!.status).toBe("pending_verification");
    expect(after!.note).toBeNull();
    expect(after!.reference).toBe("CASH-OK");
  });

  it("rejectPayment then re-claim; verify from pending_verification settles ledger", async () => {
    const { rejectPayment } = await import("../orders.service");
    await setPaymentConfig({
      methods: [
        {
          id: "etransfer",
          kind: "manual",
          enabled: true,
          label: "Interac e-Transfer",
          payeeHandle: "pay@test.ca",
          taxes: [],
        },
      ],
    });
    await sharedCache("app-settings").evictAll();

    const { deploymentId } = await createOrder(
      await baseInput({ paymentMethodId: "etransfer", phone: "+16475550444" }),
    );
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));

    await claimPayment(pay!.publicId, { reference: "BAD" });
    await rejectPayment(pay!.publicId, "No matching transfer");
    const [rejected] = await db.select().from(payments).where(eq(payments.id, pay!.id));
    expect(rejected!.status).toBe("rejected");
    expect(rejected!.note).toBe("No matching transfer");

    await expect(rejectPayment(pay!.publicId, "again")).rejects.toThrow(/cannot be rejected/i);

    await claimPayment(pay!.publicId, { reference: "GOOD-456" });
    const [reclaimed] = await db.select().from(payments).where(eq(payments.id, pay!.id));
    expect(reclaimed!.status).toBe("pending_verification");
    expect(reclaimed!.note).toBeNull();

    await verifyPayment(pay!.publicId);
    const [paid] = await db.select().from(payments).where(eq(payments.id, pay!.id));
    expect(paid!.status).toBe("paid");

    const paymentLed = await db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.orderId, order!.id), eq(ledgerEntries.type, "payment")));
    expect(paymentLed).toHaveLength(1);
  });
});

describe("verifyPayment — stripe extensions", () => {
  afterAll(reset);
  beforeEach(async () => {
    await reset();
    await setPaymentConfig({
      methods: [{ id: "etransfer", kind: "manual", enabled: true, label: "Interac e-Transfer", payeeHandle: "pay@test.ca", taxes: [] }],
    });
    await sharedCache("app-settings").evictAll();
  });

  async function pendingPayment() {
    const { publicId } = await createOrder(await baseInput({ paymentMethodId: "etransfer" }));
    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));
    return pay!;
  }

  it("credits amount + surcharge and stamps the provider event id on the ledger", async () => {
    const pay = await pendingPayment();
    await db.update(payments).set({ method: "stripe", surchargeAmount: "4.80" }).where(eq(payments.id, pay.id));

    await verifyPayment(pay.publicId, { actorId: null, providerEventId: "evt_1", fromProvider: true });

    const rows = await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, pay.id));
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.amount)).toBeCloseTo(Number(pay.amount) + 4.8, 2);
    expect(rows[0]!.providerEventId).toBe("evt_1");
  });

  it("refuses a manual verify of a card payment and writes nothing", async () => {
    const pay = await pendingPayment();
    await db.update(payments).set({ method: "stripe" }).where(eq(payments.id, pay.id));
    await expect(verifyPayment(pay.publicId, { actorId: null })).rejects.toThrow("Card payments settle automatically");
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, pay.id))).toHaveLength(0);
    const [row] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(row!.status).not.toBe("paid");
  });

  it("is idempotent across two concurrent verifies", async () => {
    const pay = await pendingPayment();
    await Promise.all([verifyPayment(pay.publicId, {}), verifyPayment(pay.publicId, {})]);
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, pay.id))).toHaveLength(1);
  });
});
