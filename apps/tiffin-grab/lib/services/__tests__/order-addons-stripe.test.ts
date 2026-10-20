import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { cutoffMsFor, nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const status = vi.fn();
const preview = vi.fn();
const create = vi.fn();
const refund = vi.fn();
const retrieve = vi.fn();
const stripeTax = vi.fn();
const verify = vi.fn();
vi.mock("@/lib/payments/stripe", async (orig) => ({
  ...(await orig<object>()),
  stripeRuntime: async () => ({
    stripe: { paymentIntents: { cancel: vi.fn(), retrieve: (...a: unknown[]) => retrieve(...a) } },
    cfg: {
      surcharge: { enabled: true, ratePct: 2.4, excludeProvinces: ["QC"], networksNotifiedOn: "2026-09-01" },
      tax: { enabled: true, taxCode: "txcd_x", surchargeTaxable: true },
    },
  }),
  customerStore: { get: async () => "cus_test", set: async () => {} },
}));
vi.mock("@foundry/payments/stripe", async (orig) => ({
  ...(await orig<object>()),
  fetchIntentStatus: (...a: unknown[]) => status(...a),
  previewConfirmationToken: (...a: unknown[]) => preview(...a),
  createAndConfirmIntent: (...a: unknown[]) => create(...a),
  ensureCustomer: async () => "cus_test",
  refundIntent: (...a: unknown[]) => refund(...a),
}));
vi.mock("@/lib/tax/checkout-taxes", async (orig) => ({ ...(await orig<object>()), stripeTaxFor: (...a: unknown[]) => stripeTax(...a) }));
vi.mock("@/lib/services/orders.service", async (orig) => {
  const real = await orig<typeof import("@/lib/services/orders.service")>();
  verify.mockImplementation(real.verifyPayment);
  return { ...real, verifyPayment: (...a: Parameters<typeof real.verifyPayment>) => verify(...a) };
});

const { db } = await import("@/db/client");
const { addons, deliveries, ledgerEntries, orderActivities, orderAddons, orders, payments, users } = await import("@/db/schema");
const { invalidateCatalogSnapshot, loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { mealSizeAddons } = await import("@/lib/catalog/types");
const { getAppSettings, setPaymentConfig } = await import("../app-settings.service");
const { sharedCache } = await import("@/lib/cache");
const { cancelOrder, createOrder } = await import("../orders.service");
const { addOrderAddons, quoteOrderAddons } = await import("../order-addons.service");
const { payByCard, settleStripePayment } = await import("../payment-stripe");
const { nextCutoffMs } = await import("@/lib/orders/paid-start");
const { toCents } = await import("@/lib/payments/stripe");
const fx = await import("./stripe-fixture");

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function stripeAndEtransfer() {
  await setPaymentConfig({
    methods: [
      { id: "etransfer", kind: "manual", enabled: true, label: "e-Transfer", payeeHandle: "p@x.ca", taxes: [] },
      { id: "stripe", kind: "online", enabled: true, label: "Card", taxes: [] },
    ],
  });
  await sharedCache("app-settings").evictAll();
}

// A paid, running 1-week plan (5 tiffins), then card payments switched on.
async function runningOrder() {
  await setPaymentConfig({ methods: [] }); // simulated checkout, as the paid plan's own payment
  await sharedCache("app-settings").evictAll();
  const snap = await loadCatalogSnapshot();
  const mealSize = snap.mealSizes.find((m) => !m.trial)!;
  const { publicId } = await createOrder({
    planKey: mealSize.planKey,
    selections: {
      mealSizeId: mealSize.publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { email: `s${Math.random().toString(36).slice(2)}@test.invalid`, fullName: "Card Addy", phone: "+16475550124", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  await db.update(orders).set({ status: "active" }).where(eq(orders.publicId, publicId));
  await stripeAndEtransfer();
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return order!;
}

async function anAddon() {
  return mealSizeAddons(await loadCatalogSnapshot())[0]!;
}

async function createLink(order: { publicId: string }) {
  const addon = await anAddon();
  const selections = [{ key: addon.key, qty: 1 }];
  const shown = await quoteOrderAddons(order.publicId, selections, "stripe");
  const res = await addOrderAddons(order.publicId, { selections, methodId: "stripe", expectedAmountDue: shown.amountDue }, null);
  const [pay] = await db.select().from(payments).where(eq(payments.publicId, res.paymentPublicId!));
  return { addon, quote: res, pay: pay! };
}

const succeeded = (pay: { publicId: string; amount: string }) =>
  status.mockResolvedValue({ piId: "pi_a", status: "succeeded", amountReceivedCents: toCents(pay.amount), currency: "cad", paymentRef: pay.publicId, created: 1 });

describe("nextCutoffMs", () => {
  it("is today's cutoff while it is ahead, else tomorrow's", () => {
    const tz = "America/Toronto";
    const todayCut = cutoffMsFor("2030-01-11", 10, tz); // cutoff on 2030-01-10 at 10:00
    expect(nextCutoffMs(todayCut - 1, 10, tz)).toBe(todayCut);
    expect(nextCutoffMs(todayCut, 10, tz)).toBe(cutoffMsFor("2030-01-12", 10, tz));
  });
});

describe("Stripe add-ons (integration)", () => {
  let seededAddonId: bigint | null = null;
  beforeAll(async () => {
    if (mealSizeAddons(await loadCatalogSnapshot())[0]) return;
    const snap = await loadCatalogSnapshot();
    const plan = snap.plans.find((p) => p.offeredSlots.length > 0)!;
    const [row] = await db.insert(addons).values({ key: "mid-plan-stripe-test", name: "Mid Plan Stripe Test", category: plan.offeredSlots[0], planId: plan.id, pricePerTiffin: "15.00", maxQty: 5 }).returning({ id: addons.id });
    seededAddonId = row!.id;
    await invalidateCatalogSnapshot();
  });
  beforeEach(async () => {
    await db.delete(orderAddons);
    await fx.reset();
    vi.clearAllMocks();
    stripeTax.mockResolvedValue(null);
    refund.mockResolvedValue("re_1");
    retrieve.mockResolvedValue({ latest_charge: null });
  });
  afterAll(async () => {
    await db.delete(orderAddons);
    await fx.cleanup();
    if (seededAddonId) {
      await db.delete(addons).where(eq(addons.id, seededAddonId));
      await invalidateCatalogSnapshot();
    }
  });

  it("creates a pending Stripe add-on payment without touching the order", async () => {
    const order = await runningOrder();
    const { timezone, cutoffHour } = await getAppSettings();
    const before = nextCutoffMs(Date.now(), cutoffHour, timezone);
    const { addon, quote, pay } = await createLink(order);
    const after = nextCutoffMs(Date.now(), cutoffHour, timezone);

    expect(pay).toMatchObject({ status: "awaiting_payment", method: "stripe", amount: quote.amountDue.toFixed(2), taxSource: "fallback" });
    expect(pay.addonRequest).toMatchObject({ selections: [{ key: addon.key, qty: 1 }], openTiffins: 5, amountDue: quote.amountDue });
    expect([before, after]).toContain(pay.expiresAt);
    expect(await db.select().from(orderAddons).where(eq(orderAddons.orderId, order.id))).toHaveLength(0);
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o!.total).toBe(order.total);
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, pay.id))).toHaveLength(0);
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.orderId, order.id));
    expect(acts.some((a) => a.note === "Add-on payment link created")).toBe(true);
  });

  it("allows one live add-on payment per order", async () => {
    const order = await runningOrder();
    const { pay } = await createLink(order);
    await expect(createLink(order)).rejects.toThrow("Regenerate or cancel the existing link first");
    // An expired link no longer blocks a new one.
    await db.update(payments).set({ expiresAt: 0 }).where(eq(payments.id, pay.id));
    await expect(createLink(order)).resolves.toBeTruthy();
  });

  it("applies the add-ons when Stripe confirms", async () => {
    const order = await runningOrder();
    const { addon, quote, pay } = await createLink(order);
    succeeded(pay);

    expect(await settleStripePayment({ paymentRef: pay.publicId, piId: "pi_a" }, "webhook", "evt_a")).toBe("paid");

    const [p] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(p!.status).toBe("paid");
    const rows = await db.select().from(orderAddons).where(eq(orderAddons.orderId, order.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ addonKey: addon.key, qty: 1, amount: quote.addonSubtotal.toFixed(2) });
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(Number(o!.total)).toBe(round2(Number(order.total) + quote.addonSubtotal + quote.taxTotal));
    const credits = await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, pay.id));
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ direction: "credit", type: "payment", amount: (Number(pay.amount) + Number(pay.surchargeAmount ?? 0)).toFixed(2) });
    expect(verify).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
  });

  it("applies once under a webhook/return race", async () => {
    const order = await runningOrder();
    const { quote, pay } = await createLink(order);
    succeeded(pay);

    await Promise.all([
      settleStripePayment({ paymentRef: pay.publicId, piId: "pi_a" }, "webhook", "evt_a"),
      settleStripePayment({ paymentRef: pay.publicId, piId: "pi_a" }, "return"),
    ]);

    expect(await db.select().from(orderAddons).where(eq(orderAddons.orderId, order.id))).toHaveLength(1);
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, pay.id))).toHaveLength(1);
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(Number(o!.total)).toBe(round2(Number(order.total) + quote.amountDue));
  });

  it("applies to fewer tiffins and refunds the difference", async () => {
    const order = await runningOrder();
    const { addon, quote, pay } = await createLink(order);
    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).orderBy(asc(deliveries.deliveryDate));
    await db.update(deliveries).set({ cutoffAt: 1 }).where(eq(deliveries.id, rows[0]!.id));
    succeeded(pay);
    retrieve.mockResolvedValue({ latest_charge: { amount: toCents(pay.amount), amount_refunded: 0 } });

    expect(await settleStripePayment({ paymentRef: pay.publicId, piId: "pi_a" }, "webhook", "evt_a")).toBe("paid");

    const applied = await db.select().from(orderAddons).where(eq(orderAddons.orderId, order.id));
    expect(applied).toHaveLength(1);
    expect(applied[0]!.amount).toBe(round2(addon.pricePerTiffin * 4).toFixed(2));
    const perTiffinCents = Math.round(toCents(quote.amountDue) / 5);
    expect(refund).toHaveBeenCalledWith(expect.anything(), "pi_a", perTiffinCents, expect.any(String));
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.orderId, order.id));
    expect(acts.some((a) => /refund/i.test(a.note ?? "") && a.note!.includes((perTiffinCents / 100).toFixed(2)))).toBe(true);
  });

  it("records but does not apply when the order was cancelled", async () => {
    const order = await runningOrder();
    const { pay } = await createLink(order);
    await cancelOrder(order.publicId);
    succeeded(pay);

    expect(await settleStripePayment({ paymentRef: pay.publicId, piId: "pi_a" }, "webhook", "evt_a")).toBe("paid");

    const [p] = await db.select().from(payments).where(eq(payments.id, pay.id));
    expect(p!.status).toBe("paid");
    expect(await db.select().from(orderAddons).where(eq(orderAddons.orderId, order.id))).toHaveLength(0);
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.paymentId, pay.id))).toHaveLength(1);
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.orderId, order.id));
    expect(acts.some((a) => a.note?.includes("refund needed"))).toBe(true);
  });

  it("charges tax on the add-on base only", async () => {
    stripeTax.mockImplementation(async (i: { taxableCents: number }) => {
      const taxCents = Math.round(i.taxableCents * 0.13);
      return { calculationId: `tc_${i.taxableCents}`, taxCents, totalCents: i.taxableCents + taxCents, expiresAt: Date.now() + 3600_000, lines: [{ label: "HST", ratePct: 13, amountCents: taxCents }], reasons: [] };
    });
    const order = await runningOrder();
    const { quote, pay } = await createLink(order);
    expect(pay).toMatchObject({ taxSource: "stripe", taxCalculationId: `tc_${toCents(quote.addonSubtotal)}` });
    expect(quote.taxTotal).toBe(round2(quote.addonSubtotal * 0.13));
    stripeTax.mockClear();

    const [owner] = await db.select({ publicId: users.publicId }).from(users).where(eq(users.id, order.userId!));
    preview.mockResolvedValue({ funding: "debit", brand: "visa", last4: "1111" });
    create.mockResolvedValue({ status: "requires_action", piId: "pi_t", clientSecret: "cs" });
    await payByCard({ paymentPublicId: pay.publicId, userPublicId: owner!.publicId, confirmationTokenId: "ct_1", acceptSurcharge: true, returnUrl: "u" });

    expect(stripeTax.mock.calls[0]![0]).toMatchObject({ taxableCents: toCents(quote.addonSubtotal) });
    expect(create.mock.calls[0]![1]).toMatchObject({ amountCents: toCents(quote.amountDue) });
  });
});
