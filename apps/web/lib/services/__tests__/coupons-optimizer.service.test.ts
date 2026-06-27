import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@tiffin/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { coupons, couponRedemptions, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { couponsService } = await import("../coupons.service");
const { createOrder } = await import("../orders.service");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(couponRedemptions);
  await db.delete(coupons);
  await db.delete(payments);
  await db.delete(orderActivities);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

type Values = typeof coupons.$inferInsert;
const ins = (v: Values) => db.insert(coupons).values(v).returning();
const sumOf = (rs: { amount: number }[]): number =>
  Math.round(rs.reduce((s, r) => s + r.amount, 0) * 100) / 100;

// Live-DB harness: tests hit the seeded Postgres; reset wipes only coupon/order
// rows + non-system users, never the shared usr_system fixture.
describe("couponsService.resolveBestCoupons (optimizer)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("picks the max-discount valid set among auto-apply coupons", async () => {
    await ins({ code: "AUTO-P10", kind: "percentage", name: "Auto 10%", valuePct: "10", autoApply: true, stackable: true });
    await ins({ code: "AUTO-F20", kind: "fixed", name: "Auto $20", valueAmount: "20", autoApply: true, stackable: true });
    await ins({ code: "AUTO-X25", kind: "fixed", name: "Auto $25 exclusive", valueAmount: "25", autoApply: true, stackable: false });

    const best = await couponsService.resolveBestCoupons({ subtotal: 100 });
    // Stackable set = 10 + 20 = 30 beats the exclusive 25.
    expect(best.redemptions).toHaveLength(2);
    expect(sumOf(best.redemptions)).toBe(30);
    expect(best.redemptions.some((r) => r.coupon.code === "AUTO-X25")).toBe(false);
  });

  it("uses an exclusive coupon alone when it beats the stackable set", async () => {
    await ins({ code: "X90", kind: "fixed", name: "Big exclusive", valueAmount: "90", autoApply: true, stackable: false });
    await ins({ code: "S10", kind: "percentage", name: "Small stackable", valuePct: "10", autoApply: true, stackable: true });

    const best = await couponsService.resolveBestCoupons({ subtotal: 100 });
    expect(best.redemptions).toHaveLength(1);
    expect(best.redemptions[0].coupon.code).toBe("X90");
    expect(best.redemptions[0].amount).toBe(90);
  });

  it("uses the stackable set when it beats an exclusive coupon", async () => {
    await ins({ code: "X5", kind: "fixed", name: "Tiny exclusive", valueAmount: "5", autoApply: true, stackable: false });
    await ins({ code: "S20P", kind: "percentage", name: "20% stackable", valuePct: "20", autoApply: true, stackable: true });
    await ins({ code: "S10F", kind: "fixed", name: "$10 stackable", valueAmount: "10", autoApply: true, stackable: true });

    const best = await couponsService.resolveBestCoupons({ subtotal: 100 });
    // Stackable set = 20 + 10 = 30 beats the exclusive 5.
    expect(best.redemptions).toHaveLength(2);
    expect(sumOf(best.redemptions)).toBe(30);
  });

  it("skips a coupon the user has already exhausted (maxPerUser reached)", async () => {
    await ins({ code: "ONCEU", kind: "fixed", name: "Once per user", valueAmount: "10", autoApply: true, maxPerUser: 1 });

    // First order auto-applies + redeems the coupon for the provisioned customer.
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
      contact: { fullName: "A B", phone: "+16475559001", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    });
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));

    // Without a user the coupon is still eligible; for the exhausted user it is skipped.
    const anon = await couponsService.resolveBestCoupons({ subtotal: 100 });
    expect(anon.redemptions).toHaveLength(1);
    const exhausted = await couponsService.resolveBestCoupons({ subtotal: 100, userId: order.userId! });
    expect(exhausted.redemptions).toHaveLength(0);
  });

  it("lets a manual stackable code join the auto-apply combo", async () => {
    await ins({ code: "AUTO-S10", kind: "percentage", name: "Auto 10%", valuePct: "10", autoApply: true, stackable: true });
    await ins({ code: "MAN-S15", kind: "fixed", name: "Manual $15", valueAmount: "15", autoApply: false, stackable: true });

    const best = await couponsService.resolveBestCoupons({ subtotal: 100, manualCode: "MAN-S15" });
    expect(best.redemptions).toHaveLength(2);
    expect(sumOf(best.redemptions)).toBe(25);
    expect(best.manualError).toBeUndefined();
  });

  it("lets a manual exclusive code replace the auto set when it is better", async () => {
    await ins({ code: "AUTO-S10B", kind: "percentage", name: "Auto 10%", valuePct: "10", autoApply: true, stackable: true });
    await ins({ code: "MAN-X50", kind: "fixed", name: "Manual $50", valueAmount: "50", autoApply: false, stackable: false });

    const best = await couponsService.resolveBestCoupons({ subtotal: 100, manualCode: "MAN-X50" });
    expect(best.redemptions).toHaveLength(1);
    expect(best.redemptions[0].coupon.code).toBe("MAN-X50");
    expect(best.redemptions[0].amount).toBe(50);
  });

  it("reports an invalid manual code without dropping the auto set", async () => {
    await ins({ code: "AUTO-OK", kind: "fixed", name: "Auto $10", valueAmount: "10", autoApply: true, stackable: true });

    const best = await couponsService.resolveBestCoupons({ subtotal: 100, manualCode: "NOPE" });
    expect(best.manualError).toBeTruthy();
    expect(best.redemptions).toHaveLength(1);
    expect(best.redemptions[0].coupon.code).toBe("AUTO-OK");
  });

  it("excludes rep_daily coupons from the optimizer entirely", async () => {
    const [rep] = await db.insert(users).values({ email: "rep-opt@x.com", role: "member" }).returning();
    // Even with autoApply set, a rep_daily coupon must never enter the customer optimizer.
    await ins({ code: "REP-AUTO", kind: "rep_daily", name: "Rep daily", capPct: "50", capAmount: "50", autoApply: true, ownerUserId: rep.id });
    await ins({ code: "AUTO-ONLY", kind: "fixed", name: "Auto $10", valueAmount: "10", autoApply: true });

    const best = await couponsService.resolveBestCoupons({ subtotal: 100 });
    expect(best.redemptions).toHaveLength(1);
    expect(best.redemptions[0].coupon.code).toBe("AUTO-ONLY");
    expect(best.redemptions.some((r) => r.coupon.kind === "rep_daily")).toBe(false);
  });

  it("never lets summed amountApplied exceed the subtotal and floors the total at 0", async () => {
    await ins({ code: "BIG80", kind: "fixed", name: "$80", valueAmount: "80", autoApply: true, stackable: true });
    await ins({ code: "HALF", kind: "percentage", name: "50%", valuePct: "50", autoApply: true, stackable: true });

    const best = await couponsService.resolveBestCoupons({ subtotal: 100 });
    // 80 + 50 = 130 of raw discount, clamped to the $100 subtotal.
    expect(sumOf(best.redemptions)).toBe(100);
  });

  it("respects the auto-apply window (not-yet-started / expired excluded)", async () => {
    const now = Date.now();
    await ins({ code: "FUTURE", kind: "fixed", name: "Not yet", valueAmount: "10", autoApply: true, startsAt: now + 3_600_000 });
    await ins({ code: "PAST", kind: "fixed", name: "Expired", valueAmount: "20", autoApply: true, expiresAt: now - 3_600_000 });
    await ins({ code: "NOW", kind: "fixed", name: "Live", valueAmount: "5", autoApply: true, startsAt: now - 3_600_000, expiresAt: now + 3_600_000 });

    const best = await couponsService.resolveBestCoupons({ subtotal: 100 });
    expect(best.redemptions).toHaveLength(1);
    expect(best.redemptions[0].coupon.code).toBe("NOW");
    expect(best.redemptions[0].amount).toBe(5);
  });
});
