import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, ne } from "drizzle-orm";
import { ValidationError, nextWeekday, zonedDateIso } from "@tiffin/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { coupons, couponRedemptions, ledgerEntries, orders, payments, users } = await import("@/db/schema");
const { couponsService } = await import("../coupons.service");
const { createOrder } = await import("../orders.service");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");

const IST = "Asia/Kolkata";
const istDate = zonedDateIso(Date.now(), IST);

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(couponRedemptions);
  await db.delete(coupons);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

// A sales rep (role member) — mintRepDaily needs a real owner row (FK).
async function makeRep(email: string) {
  const [rep] = await db
    .insert(users)
    .values({ email, role: "member", name: "Rep One" })
    .returning({ id: users.id, publicId: users.publicId });
  return rep;
}

// Distinct phone → distinct provisioned customer, so the rep coupon (maxPerUser=1)
// can be redeemed once per customer up to its daily budget.
async function makeOrder(phone: string) {
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
    contact: { fullName: "A B", phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
  return o;
}

describe("couponsService.mintRepDaily (daily-use budget)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("snapshots maxRedemptions to the effective dailyUses", async () => {
    const rep = await makeRep("rep-budget@x.com");
    const inserted = await db.transaction((tx) =>
      couponsService.mintRepDaily(tx, {
        ownerUserId: rep.id,
        ownerPublicId: rep.publicId,
        istDate,
        capPct: 50,
        capAmount: 30,
        dailyUses: 3,
        expiresAt: Date.now() + 86_400_000,
      }),
    );
    expect(inserted).toBe(true);

    const [row] = await db
      .select()
      .from(coupons)
      .where(and(eq(coupons.kind, "rep_daily"), eq(coupons.ownerUserId, rep.id)));
    expect(row.maxRedemptions).toBe(3);
    expect(row.maxPerUser).toBe(1);
  });

  it("default dailyUses=1 preserves single-use", async () => {
    const rep = await makeRep("rep-single@x.com");
    await db.transaction((tx) =>
      couponsService.mintRepDaily(tx, {
        ownerUserId: rep.id,
        ownerPublicId: rep.publicId,
        istDate,
        capPct: 10,
        capAmount: 5,
        dailyUses: 1,
        expiresAt: Date.now() + 86_400_000,
      }),
    );
    const [row] = await db.select().from(coupons).where(eq(coupons.ownerUserId, rep.id));
    expect(row.maxRedemptions).toBe(1);
  });

  it("floors a zero/negative budget at 1", async () => {
    const rep = await makeRep("rep-floor@x.com");
    await db.transaction((tx) =>
      couponsService.mintRepDaily(tx, {
        ownerUserId: rep.id,
        ownerPublicId: rep.publicId,
        istDate,
        capPct: 10,
        capAmount: 5,
        dailyUses: 0,
        expiresAt: Date.now() + 86_400_000,
      }),
    );
    const [row] = await db.select().from(coupons).where(eq(coupons.ownerUserId, rep.id));
    expect(row.maxRedemptions).toBe(1);
  });
});

describe("couponsService.getTodayRepCoupon", () => {
  beforeEach(reset);
  afterAll(reset);

  it("projects code + used/total + ceilings, resolving the owner publicId", async () => {
    const rep = await makeRep("rep-today@x.com");
    await db.transaction((tx) =>
      couponsService.mintRepDaily(tx, {
        ownerUserId: rep.id,
        ownerPublicId: rep.publicId,
        istDate,
        capPct: 25,
        capAmount: 40,
        dailyUses: 4,
        expiresAt: Date.now() + 86_400_000,
      }),
    );

    const view = await couponsService.getTodayRepCoupon(rep.publicId, istDate);
    expect(view).not.toBeNull();
    expect(view!.code).toBe(`REP-${istDate}-${rep.publicId.split("_").at(-1)}`);
    expect(view!.used).toBe(0);
    expect(view!.total).toBe(4);
    expect(view!.capPct).toBe(25);
    expect(view!.capAmount).toBe(40);
  });

  it("returns null when the rep has no coupon today", async () => {
    const rep = await makeRep("rep-none@x.com");
    expect(await couponsService.getTodayRepCoupon(rep.publicId, istDate)).toBeNull();
  });
});

describe("rep daily-use budget enforcement (redeem)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("allows N redemptions then rejects the N+1th, tracking used/total", async () => {
    const rep = await makeRep("rep-redeem@x.com");
    await db.transaction((tx) =>
      couponsService.mintRepDaily(tx, {
        ownerUserId: rep.id,
        ownerPublicId: rep.publicId,
        istDate,
        capPct: 50,
        capAmount: 30,
        dailyUses: 2,
        expiresAt: Date.now() + 86_400_000,
      }),
    );
    const [coupon] = await db.select().from(coupons).where(eq(coupons.ownerUserId, rep.id));

    const o1 = await makeOrder("+16475550101");
    const o2 = await makeOrder("+16475550102");
    const o3 = await makeOrder("+16475550103");

    await db.transaction((tx) =>
      couponsService.redeem(tx, { coupon, userId: o1.userId!, orderId: o1.id, amountApplied: 5 }),
    );
    await db.transaction((tx) =>
      couponsService.redeem(tx, { coupon, userId: o2.userId!, orderId: o2.id, amountApplied: 5 }),
    );

    const mid = await couponsService.getTodayRepCoupon(rep.publicId, istDate);
    expect(mid!.used).toBe(2);
    expect(mid!.total).toBe(2);

    // Budget exhausted → the N+1th redemption is rejected by the atomic guard.
    await expect(
      db.transaction((tx) =>
        couponsService.redeem(tx, { coupon, userId: o3.userId!, orderId: o3.id, amountApplied: 5 }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const [after] = await db.select().from(coupons).where(eq(coupons.id, coupon.id));
    expect(after.redemptionCount).toBe(2);
  });
});
