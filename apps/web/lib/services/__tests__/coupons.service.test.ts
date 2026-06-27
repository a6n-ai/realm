import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, ne } from "drizzle-orm";
import { ValidationError, nextWeekday } from "@tiffin/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { coupons, couponRedemptions, ledgerEntries, orders, payments, users } = await import("@/db/schema");
const { couponsService } = await import("../coupons.service");
const { ledgerService } = await import("../ledger.service");
const { createOrder } = await import("../orders.service");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");

type Coupon = typeof coupons.$inferSelect;

const fakeCoupon = (over: Partial<Coupon>): Coupon => ({
  id: 1n,
  publicId: "cpn_test",
  createdAt: 0,
  createdBy: null,
  updatedAt: 0,
  updatedBy: null,
  code: "TEST",
  kind: "fixed",
  name: "Test Coupon",
  description: null,
  valuePct: null,
  valueAmount: null,
  capPct: null,
  capAmount: null,
  minSubtotal: null,
  maxRedemptions: null,
  maxPerUser: null,
  redemptionCount: 0,
  stackable: false,
  planTypes: [],
  startsAt: null,
  expiresAt: null,
  ownerUserId: null,
  istDate: null,
  active: true,
  config: null,
  ...over,
});

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(couponRedemptions);
  await db.delete(coupons);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

describe("couponsService.resolveDiscount (pure math)", () => {
  it("percentage = round2(subtotal * pct / 100)", () => {
    const line = couponsService.resolveDiscount(fakeCoupon({ kind: "percentage", valuePct: "10" }), { subtotal: 200 });
    expect(line.amount).toBe(20);
  });

  it("fixed = valueAmount when below subtotal", () => {
    const line = couponsService.resolveDiscount(fakeCoupon({ kind: "fixed", valueAmount: "50" }), { subtotal: 200 });
    expect(line.amount).toBe(50);
  });

  it("fixed clamps to subtotal", () => {
    const line = couponsService.resolveDiscount(fakeCoupon({ kind: "fixed", valueAmount: "500" }), { subtotal: 200 });
    expect(line.amount).toBe(200);
  });

  it("first_order resolves as percentage per config.mode", () => {
    const c = fakeCoupon({ kind: "first_order", valuePct: "10", config: { kind: "first_order", mode: "percentage" } });
    expect(couponsService.resolveDiscount(c, { subtotal: 100 }).amount).toBe(10);
  });

  it("first_order resolves as fixed per config.mode", () => {
    const c = fakeCoupon({ kind: "first_order", valueAmount: "15", config: { kind: "first_order", mode: "fixed" } });
    expect(couponsService.resolveDiscount(c, { subtotal: 100 }).amount).toBe(15);
  });

  it("free_delivery is a $0 placeholder", () => {
    const line = couponsService.resolveDiscount(fakeCoupon({ kind: "free_delivery", valueAmount: "99" }), { subtotal: 200 });
    expect(line.amount).toBe(0);
  });

  it("rep_daily clamps to the lower of (requested, pct ceiling, amount ceiling)", () => {
    const c = fakeCoupon({ kind: "rep_daily", capPct: "50", capAmount: "30" });
    // subtotal 200 → pct ceiling 100; amount ceiling 30; requested 100 → min = 30
    expect(couponsService.resolveDiscount(c, { subtotal: 200, requestedAmount: 100 }).amount).toBe(30);
    // requested below both ceilings wins
    expect(couponsService.resolveDiscount(c, { subtotal: 200, requestedAmount: 10 }).amount).toBe(10);
  });

  it("never returns below 0", () => {
    const line = couponsService.resolveDiscount(fakeCoupon({ kind: "percentage", valuePct: "0" }), { subtotal: 200 });
    expect(line.amount).toBe(0);
  });
});

describe("couponsService.redeem (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  async function makeOrder() {
    const snap = await loadCatalogSnapshot();
    const { deploymentId } = await createOrder({
      planKey: snap.plans[0].key,
      selections: {
        mealSizeId: snap.mealSizes[0].publicId,
        frequencyKey: "5_day",
        persons: 1,
        mealSlots: ["lunch"],
        includeSaturday: false,
        includeSunday: false,
        durationWeeks: 1,
        startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
      },
      contact: { fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    });
    const [o] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    return o;
  }

  it("inserts a redemption, bumps the count, and writes a discount ledger debit", async () => {
    const order = await makeOrder();
    const [coupon] = await db
      .insert(coupons)
      .values({ code: "SAVE10", kind: "fixed", name: "Save 10", valueAmount: "10", maxRedemptions: 1, maxPerUser: 1 })
      .returning();

    await db.transaction((tx) =>
      couponsService.redeem(tx, { coupon, userId: order.userId!, orderId: order.id, amountApplied: 10, context: {} }),
    );

    const [after] = await db.select().from(coupons).where(eq(coupons.id, coupon.id));
    expect(after.redemptionCount).toBe(1);

    const reds = await db.select().from(couponRedemptions).where(eq(couponRedemptions.couponId, coupon.id));
    expect(reds).toHaveLength(1);
    expect(reds[0].amountApplied).toBe("10.00");

    const led = await db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.orderId, order.id), eq(ledgerEntries.type, "discount")));
    expect(led).toHaveLength(1);
    expect(led[0].direction).toBe("debit");
    expect(led[0].amount).toBe("10.00");
  });

  it("enforces the global redemption cap inside the tx", async () => {
    const order = await makeOrder();
    const [coupon] = await db
      .insert(coupons)
      .values({ code: "ONCE", kind: "fixed", name: "Once", valueAmount: "5", maxRedemptions: 1 })
      .returning();

    await db.transaction((tx) =>
      couponsService.redeem(tx, { coupon, userId: order.userId!, orderId: order.id, amountApplied: 5 }),
    );

    await expect(
      db.transaction((tx) =>
        couponsService.redeem(tx, { coupon, userId: order.userId!, orderId: order.id, amountApplied: 5 }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const [after] = await db.select().from(coupons).where(eq(coupons.id, coupon.id));
    expect(after.redemptionCount).toBe(1);
  });
});

describe("ledgerService.totalSpent (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("sums payment credits minus refund debits, ignoring discounts", async () => {
    const [user] = await db.insert(users).values({ email: "spender@x.com", role: "user" }).returning();

    await db.transaction(async (tx) => {
      await ledgerService.record(tx, { userId: user.id, direction: "credit", type: "payment", amount: 100 });
      await ledgerService.record(tx, { userId: user.id, direction: "credit", type: "payment", amount: 50 });
      await ledgerService.record(tx, { userId: user.id, direction: "debit", type: "refund", amount: 30 });
      await ledgerService.record(tx, { userId: user.id, direction: "debit", type: "discount", amount: 15 });
    });

    expect(await ledgerService.totalSpent(user.id)).toBe("120.00");
  });
});
