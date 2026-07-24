import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { couponRedemptions, coupons, deliveries, ledgerEntries, orderActivities, orders, payments, users, walletLedger } =
  await import("@/db/schema");
const { createOrder, verifyPayment, claimPayment } = await import("../orders.service");
const { setPaymentConfig } = await import("../app-settings.service");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { sharedCache } = await import("@/lib/cache");

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
  await db.delete(users).where(ne(users.isSystem, true));
  await setPaymentConfig({ methods: [] });
  await sharedCache("app-settings").evictAll();
}

async function baseInput(over: { couponCode?: string; paymentMethodId?: string; phone?: string } = {}) {
  const snap = await loadCatalogSnapshot();
  return {
    planKey: snap.plans[0]!.key,
    selections: {
      mealSizeId: snap.mealSizes[0]!.publicId,
      frequencyKey: "5_day" as const,
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: {
      fullName: "Pay Test",
      phone: over.phone ?? "+16475550999",
      addressLine: "1 St",
      city: "Toronto",
      postalCode: "M5V 2T6",
    },
    couponCode: over.couponCode ?? null,
    paymentMethodId: over.paymentMethodId ?? null,
  };
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
});
