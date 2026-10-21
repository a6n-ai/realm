import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const status = vi.fn();
vi.mock("@/lib/payments/stripe", async (orig) => ({
  ...(await orig<object>()),
  stripeRuntime: async () => ({
    stripe: {},
    cfg: { surcharge: { enabled: false, ratePct: 0, excludeProvinces: [], networksNotifiedOn: "2026-09-01" }, tax: { enabled: false, taxCode: "txcd_x", surchargeTaxable: false } },
  }),
}));
vi.mock("@foundry/payments/stripe", async (orig) => ({ ...(await orig<object>()), fetchIntentStatus: (...a: unknown[]) => status(...a) }));

const { db } = await import("@/db/client");
const { couponRedemptions, coupons, deliveries, ledgerEntries, orderActivities, orders, payments } = await import("@/db/schema");
const { settleStripePayment } = await import("../payment-stripe");
const { plans } = await import("@/db/schema");
const { getAppSettings } = await import("../app-settings.service");
const { appToday } = await import("../start-date");
const { weekdayKey, parseIsoDateUtc } = await import("@foundry/commons");
const { activateOrder } = await import("../orders.service");
const { createOrder } = await import("../orders.service");
const { setPaymentConfig } = await import("../app-settings.service");
const { sharedCache } = await import("@/lib/cache");
const { baseInput, reset, cleanup } = await import("./stripe-fixture");

const HOUR = 3600_000;

async function load(publicId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));
  const rows = await db.select({ id: deliveries.id }).from(deliveries).where(eq(deliveries.orderId, order!.id));
  return { order: order!, pay: pay!, deliveries: rows.length };
}

const dropCoupons = async () => {
  await db.delete(couponRedemptions);
  await db.delete(coupons);
};

describe("Stripe orders wait pending until paid", () => {
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
    await dropCoupons();
  });
  afterAll(async () => {
    await dropCoupons();
    await cleanup();
  });

  it("creates a Stripe checkout order pending with no deliveries", async () => {
    const { publicId } = await createOrder(await baseInput({ paymentMethodId: "stripe" }));
    const r = await load(publicId);
    expect(r.order.status).toBe("pending");
    expect(r.deliveries).toBe(0);
    expect(r.pay.status).toBe("awaiting_payment");
    expect(Math.abs(Number(r.pay.expiresAt) - (Date.now() + 48 * HOUR))).toBeLessThan(60_000);
  });

  it("gives staff-created Stripe orders 7 days", async () => {
    const { publicId } = await createOrder(await baseInput({ paymentMethodId: "stripe" }), { staffCreated: true });
    const r = await load(publicId);
    expect(r.order.status).toBe("pending");
    expect(Math.abs(Number(r.pay.expiresAt) - (Date.now() + 7 * 24 * HOUR))).toBeLessThan(60_000);
  });

  it("still starts e-Transfer orders at create", async () => {
    const { publicId } = await createOrder(await baseInput({ paymentMethodId: "etransfer" }));
    const r = await load(publicId);
    expect(r.order.status).toBe("active");
    expect(r.deliveries).toBeGreaterThan(0);
    expect(r.pay.expiresAt).toBeNull();
  });

  it("keeps out-of-zone Stripe orders waitlisted", async () => {
    const input = await baseInput({ paymentMethodId: "stripe" });
    input.contact.postalCode = "V6B 1A1";
    const { publicId } = await createOrder(input);
    expect((await load(publicId)).order.status).toBe("waitlisted");
  });

  async function pendingStripe(input?: Awaited<ReturnType<typeof baseInput>>) {
    const { publicId } = await createOrder(input ?? (await baseInput({ paymentMethodId: "stripe" })));
    const r = await load(publicId);
    await db.update(payments).set({ providerRef: "pi_1" }).where(eq(payments.id, r.pay.id));
    status.mockResolvedValue({
      piId: "pi_1", status: "succeeded", amountReceivedCents: Math.round(Number(r.pay.amount) * 100),
      currency: "cad", paymentRef: r.pay.publicId, created: 1,
    });
    return { ...r, publicId, ref: { paymentRef: r.pay.publicId } };
  }
  const activities = async (orderId: bigint, type: "activated" | "note") =>
    db.select().from(orderActivities).where(and(eq(orderActivities.orderId, orderId), eq(orderActivities.type, type)));

  it("starts a pending Stripe order when Stripe confirms", async () => {
    const p = await pendingStripe();
    expect(await settleStripePayment(p.ref, "webhook", "evt_1")).toBe("paid");
    const r = await load(p.publicId);
    expect(r.order.status).toBe("active");
    expect(r.deliveries).toBeGreaterThan(0);
    expect(r.order.startDate).toBe(p.order.startDate);
    expect(await activities(r.order.id, "activated")).toHaveLength(1);
  });

  it("settles once when webhook and return race", async () => {
    const p = await pendingStripe();
    const out = await Promise.all([settleStripePayment(p.ref, "webhook", "evt_1"), settleStripePayment(p.ref, "return")]);
    expect(out.every((o) => o === "paid" || o === "already_paid")).toBe(true);
    expect(await activities(p.order.id, "activated")).toHaveLength(1);
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, p.pay.id))).toHaveLength(1);
  });

  it("moves the start when the chosen date passed", async () => {
    const p = await pendingStripe();
    const yesterday = new Date(Date.now() - 24 * HOUR).toISOString().slice(0, 10);
    await db.update(orders).set({ startDate: yesterday }).where(eq(orders.id, p.order.id));
    expect(await settleStripePayment(p.ref, "webhook", "evt_1")).toBe("paid");
    const r = await load(p.publicId);
    expect(r.order.status).toBe("active");
    const { timezone, cutoffHour } = await getAppSettings();
    const today = appToday(timezone, cutoffHour).toISOString().slice(0, 10);
    const [plan] = await db.select({ allowed: plans.allowedStartDays }).from(plans).where(eq(plans.id, r.order.planId));
    expect(r.order.startDate > today).toBe(true);
    expect(plan!.allowed).toContain(weekdayKey(parseIsoDateUtc(r.order.startDate)));
    expect(r.deliveries).toBeGreaterThan(0);
  });

  async function overlapped(couponCode?: string) {
    const input = await baseInput({ paymentMethodId: "stripe", ...(couponCode ? { couponCode } : {}) });
    const p = await pendingStripe(input);
    await createOrder({ ...input, couponCode: null, paymentMethodId: "etransfer" });
    return p;
  }

  it("records the payment but stays pending when another plan now overlaps", async () => {
    const p = await overlapped();
    expect(await settleStripePayment(p.ref, "webhook", "evt_1")).toBe("paid");
    const r = await load(p.publicId);
    expect(r.pay.status).toBe("paid");
    expect(r.order.status).toBe("pending");
    expect(r.deliveries).toBe(0);
    expect((await activities(r.order.id, "note")).some((a) => a.note?.includes("could not start"))).toBe(true);
  });

  it("settles coupons and coins even when it cannot start", async () => {
    await db.insert(coupons).values({ code: "SAVE10", kind: "fixed", name: "Save 10", valueAmount: "10", maxRedemptions: 5, maxPerUser: 1 });
    const p = await overlapped("SAVE10");
    expect(await settleStripePayment(p.ref, "webhook", "evt_1")).toBe("paid");
    expect((await load(p.publicId)).order.status).toBe("pending");
    expect(await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, p.order.id))).toHaveLength(1);
  });

  it("lets staff start a paid, overlap-stranded order once the conflict is gone", async () => {
    const input = await baseInput({ paymentMethodId: "stripe" });
    const p = await pendingStripe(input);
    const other = await createOrder({ ...input, couponCode: null, paymentMethodId: "etransfer" });
    await settleStripePayment(p.ref, "webhook", "evt_1");
    await expect(activateOrder(p.publicId)).rejects.toThrow(/already have a plan/);
    expect((await load(p.publicId)).order.status).toBe("pending");
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.publicId, other.publicId));
    await activateOrder(p.publicId);
    const r = await load(p.publicId);
    expect(r.order.status).toBe("active");
    expect(r.deliveries).toBeGreaterThan(0);
  });
});
