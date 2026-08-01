/**
 * End-to-end payment methods lifecycle (service-layer).
 * Covers: enable method → createOrder awaiting → claim → reject → re-claim → verify.
 * Run: pnpm exec vitest run lib/services/__tests__/payment-e2e-lifecycle.test.ts --no-file-parallelism
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const {
  couponRedemptions,
  coupons,
  deliveries,
  ledgerEntries,
  orderActivities,
  orders,
  payments,
  users,
  walletLedger,
} = await import("@/db/schema");
const {
  createOrder,
  claimPayment,
  rejectPayment,
  verifyPayment,
  getClaimPaymentContext,
  readOrder,
} = await import("../orders.service");
const { setPaymentConfig, getPaymentConfig } = await import("../app-settings.service");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { sharedCache } = await import("@/lib/cache");
const { ledgerService } = await import("../ledger.service");

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
      fullName: "E2E Pay",
      phone: over.phone ?? "+16475551100",
      email: "e2e-pay@tiffingrab.ca",
      addressLine: "100 King St W",
      city: "Toronto",
      postalCode: "M5V 2T6",
    },
    couponCode: over.couponCode ?? null,
    paymentMethodId: over.paymentMethodId ?? null,
  };
}

describe("payment methods E2E lifecycle", () => {
  beforeAll(async () => {
    await setPaymentConfig({
      methods: [
        {
          id: "etransfer",
          kind: "manual",
          enabled: true,
          label: "Interac e-Transfer",
          payeeHandle: "pay@tiffingrab.ca",
          instructions: "Send Interac e-Transfer and include your order reference.",
          requireProof: false,
          taxes: [
            { name: "GST", ratePct: 5 },
            { name: "PST", ratePct: 7 },
          ],
        },
        {
          id: "cash",
          kind: "manual",
          enabled: true,
          label: "Cash on delivery",
          payeeHandle: "driver",
          requireProof: true,
          taxes: [],
        },
      ],
      defaultMethodId: "etransfer",
    });
    await sharedCache("app-settings").evictAll();
  });

  beforeEach(reset);
  afterAll(async () => {
    await reset();
    await setPaymentConfig({ methods: [] });
    await sharedCache("app-settings").evictAll();
  });

  it("admin config persists enabled methods + taxes", async () => {
    const cfg = await getPaymentConfig();
    expect(cfg.methods.filter((m) => m.enabled)).toHaveLength(2);
    const et = cfg.methods.find((m) => m.id === "etransfer")!;
    expect(et.taxes).toHaveLength(2);
    expect(et.payeeHandle).toBe("pay@tiffingrab.ca");
  });

  it("full path: checkout → claim → reject → re-claim → verify (ledger+coupons once)", async () => {
    // Re-enable after reset wiped config via beforeEach... wait, reset doesn't clear payment config
    // except afterAll. beforeEach only clears users/orders. Config from beforeAll stays unless
    // sharedCache was flushed — reset does evictAll, so re-set.
    await setPaymentConfig({
      methods: [
        {
          id: "etransfer",
          kind: "manual",
          enabled: true,
          label: "Interac e-Transfer",
          payeeHandle: "pay@tiffingrab.ca",
          instructions: "Send Interac e-Transfer.",
          requireProof: false,
          taxes: [
            { name: "GST", ratePct: 5 },
            { name: "PST", ratePct: 7 },
          ],
        },
      ],
    });
    await sharedCache("app-settings").evictAll();

    await db.insert(coupons).values({
      code: "ETSAVE",
      kind: "fixed",
      name: "e-Transfer $10",
      valueAmount: "10",
      maxRedemptions: 5,
      allowedPaymentMethods: ["etransfer"],
    });

    // Method-gated coupon rejected on cash
    await setPaymentConfig({
      methods: [
        {
          id: "etransfer",
          kind: "manual",
          enabled: true,
          label: "Interac e-Transfer",
          payeeHandle: "pay@tiffingrab.ca",
          taxes: [{ name: "GST", ratePct: 5 }, { name: "PST", ratePct: 7 }],
        },
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

    await expect(
      createOrder(await baseInput({ couponCode: "ETSAVE", paymentMethodId: "cash", phone: "+16475551101" })),
    ).rejects.toThrow(/payment method/i);

    const { deploymentId, publicId } = await createOrder(
      await baseInput({ couponCode: "ETSAVE", paymentMethodId: "etransfer", phone: "+16475551102" }),
    );

    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    expect(order!.status).toBe("active");

    const delCount = await db.select().from(deliveries).where(eq(deliveries.orderId, order!.id));
    expect(delCount.length).toBeGreaterThan(0);

    const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));
    expect(pay!.status).toBe("awaiting_payment");
    expect(pay!.method).toBe("etransfer");

    const snap = order!.pricingSnapshot as {
      taxTotal: number;
      taxLines: { name: string; amount: number }[];
      pendingRedemptions?: unknown[];
      paymentMethodId: string;
      subtotal: number;
      total: number;
    };
    expect(snap.paymentMethodId).toBe("etransfer");
    expect(snap.taxLines.map((l) => l.name).sort()).toEqual(["GST", "PST"]);
    expect(snap.taxTotal).toBeGreaterThan(0);
    // taxable = subtotal - 10; tax = 12% of taxable; total = taxable + tax
    const taxable = Math.max(0, Math.round((snap.subtotal - 10) * 100) / 100);
    expect(snap.total).toBeCloseTo(taxable + snap.taxTotal, 2);
    expect(snap.pendingRedemptions).toHaveLength(1);

    // Deferred: no ledger, no redemption yet
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.orderId, order!.id))).toHaveLength(0);
    expect(await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, order!.id))).toHaveLength(0);

    const ctx = await getClaimPaymentContext(pay!.publicId);
    expect(ctx!.payeeHandle).toBe("pay@tiffingrab.ca");
    expect(ctx!.referenceHint).toBe(deploymentId);

    await claimPayment(pay!.publicId, { reference: "WRONG-REF" });
    let [claimed] = await db.select().from(payments).where(eq(payments.id, pay!.id));
    expect(claimed!.status).toBe("pending_verification");

    await rejectPayment(pay!.publicId, "No matching Interac transfer");
    const [rejected] = await db.select().from(payments).where(eq(payments.id, pay!.id));
    expect(rejected!.status).toBe("rejected");
    expect(rejected!.note).toBe("No matching Interac transfer");

    await claimPayment(pay!.publicId, {
      reference: "GOOD-REF-999",
      proof: { path: "payments/x/orig.png", thumbUrl: "https://cdn.test/thumb.png", name: "proof.png" },
    });
    [claimed] = await db.select().from(payments).where(eq(payments.id, pay!.id));
    expect(claimed!.status).toBe("pending_verification");
    expect(claimed!.note).toBeNull();
    expect(claimed!.reference).toBe("GOOD-REF-999");

    await verifyPayment(pay!.publicId);
    const [paid] = await db.select().from(payments).where(eq(payments.id, pay!.id));
    expect(paid!.status).toBe("paid");
    expect(paid!.capturedAt).toBeTypeOf("number");

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

    expect(await ledgerService.totalSpent(order!.userId!)).toBe(order!.total);

    // Staff readOrder shows claim fields
    const detail = await readOrder(publicId);
    expect(detail.payments[0]!.status).toBe("paid");
    expect(detail.payments[0]!.reference).toBe("GOOD-REF-999");
    expect(detail.payments[0]!.proofThumbUrl).toBe("https://cdn.test/thumb.png");

    // The whole claim → reject → re-claim → verify path is now in the activity log. It is the
    // only durable record: payments has no updatedBy, and re-claiming wipes the reject note.
    const trail = await db
      .select()
      .from(orderActivities)
      .where(eq(orderActivities.orderId, order!.id));
    const payTypes = trail.map((r) => r.type).filter((t) => t.startsWith("payment_"));
    expect(payTypes).toEqual([
      "payment_claimed",
      "payment_rejected",
      "payment_claimed",
      "payment_verified",
    ]);
    const rejectRow = trail.find((r) => r.type === "payment_rejected");
    expect(rejectRow!.note).toBe("No matching Interac transfer");

    // Idempotent re-verify
    await verifyPayment(pay!.publicId);
    expect(
      await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.orderId, order!.id), eq(ledgerEntries.type, "payment"))),
    ).toHaveLength(1);
    // ...and does not double-log.
    expect(
      (await db.select().from(orderActivities).where(eq(orderActivities.orderId, order!.id)))
        .filter((r) => r.type === "payment_verified"),
    ).toHaveLength(1);
  });

  it("cash requireProof: reference alone rejected; verify from awaiting_payment (no claim) works", async () => {
    await setPaymentConfig({
      methods: [
        {
          id: "cash",
          kind: "manual",
          enabled: true,
          label: "Cash",
          payeeHandle: "driver",
          requireProof: true,
          taxes: [],
        },
      ],
    });
    await sharedCache("app-settings").evictAll();

    const { publicId } = await createOrder(
      await baseInput({ paymentMethodId: "cash", phone: "+16475551103" }),
    );
    const detail = await readOrder(publicId);
    const pay = detail.payments[0]!;
    expect(pay.status).toBe("awaiting_payment");

    await expect(claimPayment(pay.publicId, { reference: "cash-only" })).rejects.toThrow(/screenshot is required/i);

    // Staff can verify cash without a customer claim
    await verifyPayment(pay.publicId);
    const after = await readOrder(publicId);
    expect(after.payments[0]!.status).toBe("paid");
    expect(
      await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.orderId, detail.id), eq(ledgerEntries.type, "payment"))),
    ).toHaveLength(1);
  });

  it("simulated mode (no methods): instant credit unchanged", async () => {
    await setPaymentConfig({ methods: [] });
    await sharedCache("app-settings").evictAll();

    const { deploymentId } = await createOrder(await baseInput({ phone: "+16475551104" }));
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));
    expect(pay!.status).toBe("simulated_paid");
    expect(pay!.method).toBe("simulated");
    expect(
      await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.orderId, order!.id), eq(ledgerEntries.type, "payment"))),
    ).toHaveLength(1);
  });
});
