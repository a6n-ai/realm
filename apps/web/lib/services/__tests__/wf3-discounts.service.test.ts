import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, ne } from "drizzle-orm";
import { ValidationError, nextWeekday } from "@tiffin/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { coupons, couponRedemptions, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { couponsService } = await import("../coupons.service");
const { ledgerService } = await import("../ledger.service");
const { createOrder } = await import("../orders.service");
const { mintRepCoupons } = await import("../mint-rep-coupons");
const { setDiscountPolicy } = await import("../app-settings.service");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");

type PricingSnapshot = { subtotal: number; total: number };

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(couponRedemptions);
  await db.delete(coupons);
  await db.delete(payments);
  await db.delete(orderActivities);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

const baseInput = async (over: Partial<{ phone: string; couponCode: string; repCoupon: { code: string; requestedAmount: number } }> = {}) => {
  const snap = await loadCatalogSnapshot();
  return {
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId,
      frequencyKey: "5_day" as const,
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { fullName: "A B", phone: over.phone ?? "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    couponCode: over.couponCode ?? null,
    repCoupon: over.repCoupon ?? null,
  };
};

async function orderByDeployment(deploymentId: string) {
  const [o] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
  return o;
}

describe("WF3 — cron mint governance", () => {
  beforeEach(reset);
  afterAll(reset);

  it("mints one rep_daily coupon per active rep, idempotently, with snapshotted ceilings", async () => {
    const [rep] = await db.insert(users).values({ email: "rep@x.com", name: "Rep One", role: "member" }).returning();
    await setDiscountPolicy({
      enabledKinds: ["percentage", "fixed", "free_delivery", "first_order", "rep_daily"],
      repDaily: { enabled: true, defaultCapPct: 50, defaultCapAmount: 30, perRep: {} },
    });

    const first = await mintRepCoupons();
    expect(first.minted).toBe(1);
    expect(first.skipped).toBe(0);

    const [minted] = await db.select().from(coupons).where(eq(coupons.ownerUserId, rep.id));
    expect(minted.kind).toBe("rep_daily");
    expect(minted.capPct).toBe("50.00");
    expect(minted.capAmount).toBe("30.00");
    expect(minted.maxRedemptions).toBe(1);
    expect(minted.istDate).toBe(first.istDate);
    expect(minted.expiresAt).toBeTypeOf("number");

    // Re-run after a policy ceiling change: idempotent (no new row) and the
    // already-minted coupon keeps its snapshotted ceilings.
    await setDiscountPolicy({
      enabledKinds: ["percentage", "fixed", "free_delivery", "first_order", "rep_daily"],
      repDaily: { enabled: true, defaultCapPct: 10, defaultCapAmount: 5, perRep: {} },
    });
    const second = await mintRepCoupons();
    expect(second.minted).toBe(0);
    expect(second.skipped).toBe(1);

    const rows = await db.select().from(coupons).where(eq(coupons.ownerUserId, rep.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].capPct).toBe("50.00");
  });

  it("no-ops when the rep allowance is disabled", async () => {
    await db.insert(users).values({ email: "rep2@x.com", role: "member" });
    await setDiscountPolicy({
      enabledKinds: ["rep_daily"],
      repDaily: { enabled: false, defaultCapPct: 50, defaultCapAmount: 30, perRep: {} },
    });
    const r = await mintRepCoupons();
    expect(r.minted).toBe(0);
    const all = await db.select().from(coupons).where(eq(coupons.kind, "rep_daily"));
    expect(all).toHaveLength(0);
  });
});

describe("WF3 — public coupon application via createOrder", () => {
  beforeEach(reset);
  afterAll(reset);

  it("reduces the total, writes the redemption, the discount debit, and a payment credit", async () => {
    await db.insert(coupons).values({ code: "SAVE10", kind: "fixed", name: "Save 10", valueAmount: "10", maxRedemptions: 5, maxPerUser: 1 });

    const { deploymentId } = await createOrder(await baseInput({ couponCode: "SAVE10" }));
    const order = await orderByDeployment(deploymentId);
    const snap = order.pricingSnapshot as PricingSnapshot;

    expect(Number(order.total)).toBeCloseTo(snap.subtotal - 10, 2);

    const reds = await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, order.id));
    expect(reds).toHaveLength(1);
    expect(reds[0].amountApplied).toBe("10.00");

    const discountLed = await db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.orderId, order.id), eq(ledgerEntries.type, "discount")));
    expect(discountLed).toHaveLength(1);
    expect(discountLed[0].direction).toBe("debit");

    const paymentLed = await db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.orderId, order.id), eq(ledgerEntries.type, "payment")));
    expect(paymentLed).toHaveLength(1);
    expect(paymentLed[0].direction).toBe("credit");
    expect(paymentLed[0].amount).toBe(order.total);

    // totalSpent reflects the payment credit (discount excluded).
    expect(await ledgerService.totalSpent(order.userId!)).toBe(Number(order.total).toFixed(2));
  });
});

describe("WF3 — rep coupon validation + hard gate", () => {
  beforeEach(reset);
  afterAll(reset);

  it("validateRepCoupon clamps to the lower of (requested, pct ceiling, amount ceiling)", async () => {
    const [rep] = await db.insert(users).values({ email: "rep3@x.com", role: "member" }).returning();
    const [c] = await db
      .insert(coupons)
      .values({ code: "REP-X", kind: "rep_daily", name: "Rep daily", capPct: "50", capAmount: "30", maxRedemptions: 1, ownerUserId: rep.id })
      .returning();

    // subtotal 200 → pct ceiling 100, amount ceiling 30, requested 80 → min = 30.
    const line = await couponsService.validateRepCoupon(c.code, { subtotal: 200, requestedAmount: 80, actorId: rep.id });
    expect(line.amount).toBe(30);
  });

  it("createOrder rejects a rep discount with no backing coupon owned by the actor (hard gate)", async () => {
    const [actor] = await db.insert(users).values({ email: "actor@x.com", role: "member" }).returning();
    const [other] = await db.insert(users).values({ email: "other@x.com", role: "member" }).returning();
    // A real rep coupon, but owned by a DIFFERENT rep.
    await db
      .insert(coupons)
      .values({ code: "REP-OTHER", kind: "rep_daily", name: "Rep daily", capPct: "50", capAmount: "30", maxRedemptions: 1, ownerUserId: other.id });

    await expect(
      createOrder(await baseInput({ repCoupon: { code: "REP-OTHER", requestedAmount: 10 } }), { actorId: actor.publicId }),
    ).rejects.toBeInstanceOf(ValidationError);

    // No order/redemption leaked from the rolled-back tx.
    expect(await db.select().from(couponRedemptions)).toHaveLength(0);
  });

  it("redeems a valid rep coupon in-tx and clamps the applied amount", async () => {
    const [actor] = await db.insert(users).values({ email: "actor2@x.com", role: "member" }).returning();
    await db
      .insert(coupons)
      .values({ code: "REP-OK", kind: "rep_daily", name: "Rep daily", capPct: "50", capAmount: "15", maxRedemptions: 1, maxPerUser: 1, ownerUserId: actor.id });

    const { deploymentId } = await createOrder(
      await baseInput({ phone: "+16475550222", repCoupon: { code: "REP-OK", requestedAmount: 100 } }),
      { actorId: actor.publicId },
    );
    const order = await orderByDeployment(deploymentId);
    const snap = order.pricingSnapshot as PricingSnapshot;
    // requested 100, but amount ceiling 15 (lower than 50% of subtotal) → 15 applied.
    expect(Number(order.total)).toBeCloseTo(snap.subtotal - 15, 2);

    const reds = await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, order.id));
    expect(reds).toHaveLength(1);
    expect(reds[0].amountApplied).toBe("15.00");
    expect(reds[0].redeemedBy).toBe(actor.id);
  });
});

describe("WF3 — stacking", () => {
  beforeEach(reset);
  afterAll(reset);

  it("rejects a non-stackable public coupon alongside a rep coupon", async () => {
    const [actor] = await db.insert(users).values({ email: "actor3@x.com", role: "member" }).returning();
    await db.insert(coupons).values({ code: "REP-S", kind: "rep_daily", name: "Rep daily", capPct: "50", capAmount: "20", maxRedemptions: 1, ownerUserId: actor.id });
    await db.insert(coupons).values({ code: "FLAT5", kind: "fixed", name: "Flat 5", valueAmount: "5", stackable: false });

    await expect(
      createOrder(
        await baseInput({ phone: "+16475550333", couponCode: "FLAT5", repCoupon: { code: "REP-S", requestedAmount: 10 } }),
        { actorId: actor.publicId },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("allows one stackable public coupon plus one rep coupon", async () => {
    const [actor] = await db.insert(users).values({ email: "actor4@x.com", role: "member" }).returning();
    await db.insert(coupons).values({ code: "REP-OK2", kind: "rep_daily", name: "Rep daily", capPct: "50", capAmount: "20", maxRedemptions: 1, ownerUserId: actor.id });
    await db.insert(coupons).values({ code: "STACK5", kind: "fixed", name: "Stack 5", valueAmount: "5", stackable: true, maxRedemptions: 5 });

    const { deploymentId } = await createOrder(
      await baseInput({ phone: "+16475550444", couponCode: "STACK5", repCoupon: { code: "REP-OK2", requestedAmount: 10 } }),
      { actorId: actor.publicId },
    );
    const order = await orderByDeployment(deploymentId);
    const snap = order.pricingSnapshot as PricingSnapshot;
    // rep $10 (under both ceilings) + public $5 = $15 off.
    expect(Number(order.total)).toBeCloseTo(snap.subtotal - 15, 2);

    const reds = await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, order.id));
    expect(reds).toHaveLength(2);
  });
});
