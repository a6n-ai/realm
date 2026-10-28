import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { like, ne } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
// Anonymous checkout: no wallet, so the preview and the order differ only by tax.
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

// Staff who see every org, so the estimate can match the customer's account and read their wallet.
vi.mock("@/lib/services/orders.service", async (orig) => ({ ...(await orig<typeof import("@/lib/services/orders.service")>()), resolveSessionVisibleOrgIds: async () => "all" as const }));
vi.mock("@/lib/auth/guards", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/guards")>()), requireStaff: async () => undefined }));

const { previewPrice } = await import("@/app/(dashboard)/dashboard/inquiries/[id]/order/actions");
const { db } = await import("@/db/client");
const { discounts, coupons, couponRedemptions, deliveries, ledgerEntries, orderActivities, orders, payments, users, walletLedger } =
  await import("@/db/schema");
const { createOrder } = await import("../orders.service");
const { reprice } = await import("@/app/(public)/subscribe/actions");
const priced = async (...args: Parameters<typeof reprice>) => {
  const r = await reprice(...args);
  if ("error" in r) throw new Error(r.error);
  return r;
};
const { setPaymentConfig, setProvinceTaxes } = await import("../app-settings.service");
const { loadCatalogSnapshot, invalidateCatalogSnapshot } = await import("@/lib/catalog/load");
const { sharedCache } = await import("@/lib/cache");

async function reset() {
  await db.delete(discounts).where(like(discounts.key, "regress_%"));
  await invalidateCatalogSnapshot();
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
  await setProvinceTaxes({});
  await sharedCache("app-settings").evictAll();
}

async function inputFor(postalCode: string) {
  const snap = await loadCatalogSnapshot();
  const startDate = nextWeekday(new Date());
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
      startDate: startDate.toISOString().slice(0, 10),
    },
    contact: {
      email: `p${Math.random().toString(36).slice(2)}@test.invalid`,
      fullName: "Parity Test",
      phone: "+16475550778",
      addressLine: "1 St",
      city: "Toronto",
      postalCode,
    },
    couponCode: null,
    paymentMethodId: null,
  };
}

/**
 * The receipt a customer approves must be the amount the order records. These
 * two ran tax through separate code paths once, and the preview quietly omitted
 * provincial tax that createOrder charged.
 */
describe("checkout preview matches the placed order", () => {
  beforeEach(reset);
  afterAll(reset);

  it("quotes the same total it charges, tax included, for an Ontario address", async () => {
    const input = await inputFor("M5V 2T6");
    const preview = await priced(input.selections, undefined, input.planKey, null, undefined, input.contact.postalCode);

    expect(preview.pricing.taxTotal).toBeGreaterThan(0);

    const { deploymentId } = await createOrder(input, {});
    const [order] = await db.select().from(orders).where(ne(orders.deploymentId, ""));
    expect(order!.deploymentId).toBe(deploymentId);
    expect(Number(order!.total)).toBeCloseTo(preview.pricing.total, 2);
  });

  it("quotes a different province differently, and still matches what is charged", async () => {
    // Alberta is 5% GST against Ontario's 13% HST — if the preview ignored the
    // address, these two would come out identical.
    const on = await inputFor("M5V 2T6");
    const ab = await inputFor("T2P 1J9");
    const onPreview = await priced(on.selections, undefined, on.planKey, null, undefined, on.contact.postalCode);
    const abPreview = await priced(ab.selections, undefined, ab.planKey, null, undefined, ab.contact.postalCode);

    expect(onPreview.pricing.taxTotal).toBeGreaterThan(abPreview.pricing.taxTotal);
    expect(abPreview.pricing.taxTotal).toBeCloseTo(abPreview.pricing.subtotal * 0.05, 2);

    const { deploymentId } = await createOrder(ab, {});
    const [order] = await db.select().from(orders).where(ne(orders.deploymentId, ""));
    expect(order!.deploymentId).toBe(deploymentId);
    expect(Number(order!.total)).toBeCloseTo(abPreview.pricing.total, 2);
  });

  it("shows no tax until an address is known, so the quote never overstates it", async () => {
    const input = await inputFor("M5V 2T6");
    const preview = await priced(input.selections, undefined, input.planKey, null, undefined, undefined);
    expect(preview.pricing.taxTotal).toBe(0);
  });

  it("honours an admin rate override in the preview too", async () => {
    await setProvinceTaxes({ ON: [{ name: "HST", ratePct: 5 }] });
    await sharedCache("app-settings").evictAll();
    const input = await inputFor("M5V 2T6");
    const preview = await priced(input.selections, undefined, input.planKey, null, undefined, input.contact.postalCode);
    expect(preview.pricing.taxTotal).toBeCloseTo(preview.pricing.subtotal * 0.05, 2);
  });
});

describe("coupons apply after catalog discounts", () => {
  beforeEach(reset);
  afterAll(reset);

  it("an oversized fixed coupon plus catalog discount never exceeds the subtotal; preview matches order", async () => {
    await db.insert(discounts).values({ key: "regress_delivery_all", name: "Regress", kind: "delivery", percent: "25" });
    await invalidateCatalogSnapshot();
    await db.insert(coupons).values({ code: "HUGE", kind: "fixed", name: "Huge", valueAmount: "100000", stackable: true });
    const input = { ...(await inputFor("M5V 2T6")), couponCode: "HUGE" };
    const preview = await priced(input.selections, "HUGE", input.planKey, null, undefined, input.contact.postalCode);
    const sum = (l: { amount: number }[]) => Math.round(l.reduce((s, a) => s + a.amount, 0) * 100) / 100;

    expect(sum(preview.pricing.adjustments)).toBeLessThanOrEqual(preview.pricing.subtotal);
    const coupon = preview.pricing.adjustments.find((a) => !a.discountKey)!;
    const catalogLines = preview.pricing.adjustments.filter((a) => a.discountKey);
    expect(catalogLines.length).toBeGreaterThan(0);
    expect(coupon.amount).toBeCloseTo(preview.pricing.subtotal - sum(catalogLines), 2);
    expect(preview.appliedCoupons[0]!.amount).toBeCloseTo(coupon.amount, 2);

    await createOrder(input, {});
    const [order] = await db.select().from(orders).where(ne(orders.deploymentId, ""));
    const snap = order!.pricingSnapshot as { adjustments: { amount: number }[]; subtotal: number };
    expect(sum(snap.adjustments)).toBeLessThanOrEqual(snap.subtotal);
    expect(Number(order!.total)).toBeCloseTo(preview.pricing.total, 2);
    const [red] = await db.select().from(couponRedemptions);
    expect(Number(red!.amountApplied)).toBeCloseTo(coupon.amount, 2);
  });

  it("the staff preview applies an entered coupon on top of a frequency discount and matches the order", async () => {
    await db.insert(discounts).values({ key: "regress_delivery_all", name: "Regress", kind: "delivery", percent: "10" });
    await invalidateCatalogSnapshot();
    await db.insert(coupons).values({ code: "STAFF5", kind: "fixed", name: "Staff", valueAmount: "5" });
    const input = { ...(await inputFor("M5V 2T6")), couponCode: "STAFF5" };

    const r = await previewPrice(input);
    if ("error" in r) throw new Error(r.error);
    expect(r.coupons.applied).toEqual([{ code: "STAFF5", name: "Staff", amount: 5, auto: false }]);
    expect(r.coupons.available.map((c) => c.code)).toEqual(["STAFF5"]);
    expect(r.preview.adjustments.some((a) => a.discountKey)).toBe(true);

    await createOrder(input, {});
    const [order] = await db.select().from(orders).where(ne(orders.deploymentId, ""));
    expect(Number(order!.total)).toBeCloseTo(r.preview.total, 2);
  });

  it("the estimate applies the customer's max coins by default, a lower count on request, and matches the order", async () => {
    const { coinRate } = await import("@/db/schema");
    await db.insert(coinRate).values({ currency: "CAD", valuePerCoin: "0.2500" });
    const input = await inputFor("M5V 2T6");
    const [u] = await db.insert(users).values({ email: input.contact.email, role: "user" }).returning({ id: users.id });
    await db.insert(walletLedger).values({ userId: u!.id, direction: "credit", sourceType: "seed", sourceId: "estimate-coins", coins: 40 });

    const max = await previewPrice(input, undefined, undefined, "max");
    if ("error" in max) throw new Error(max.error);
    expect(max.coins).toMatchObject({ balance: 40, maxCoins: 40, used: 40, value: 10 });
    expect(max.preview.adjustments.at(-1)).toMatchObject({ label: "Coins (40)", amount: 10 });

    const some = await previewPrice(input, undefined, undefined, 12);
    if ("error" in some) throw new Error(some.error);
    expect(some.coins).toMatchObject({ used: 12, value: 3 });

    const none = await previewPrice(input);
    if ("error" in none) throw new Error(none.error);
    expect(none.coins).toBeNull();

    await createOrder({ ...input, coins: 12 }, {});
    const [order] = await db.select().from(orders).where(ne(orders.deploymentId, ""));
    expect(Number(order!.total)).toBeCloseTo(some.preview.total, 2);
  });
});
