import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { coupons, couponRedemptions, ledgerEntries, orders, payments, users } = await import("@/db/schema");
const { couponsService } = await import("../coupons.service");

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(couponRedemptions);
  await db.delete(coupons);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

describe("couponsService.listAvailable (customer browse list)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("returns only active, non-rep_daily, in-window coupons with a customer-safe projection", async () => {
    const [rep] = await db
      .insert(users)
      .values({ email: "rep@test.com", role: "member", name: "Rep One" })
      .returning({ id: users.id });

    await db.insert(coupons).values([
      {
        code: "SAVE10",
        kind: "percentage",
        name: "Save 10%",
        description: "10% off any plan",
        valuePct: "10",
        active: true,
        redemptionCount: 3,
        ownerUserId: null,
      },
      {
        code: "REP-2026-07-11-abc",
        kind: "rep_daily",
        name: "Rep daily",
        active: true,
        capPct: "50",
        capAmount: "30",
        ownerUserId: rep.id,
        istDate: "2026-07-11",
      },
      {
        code: "INACTIVE10",
        kind: "fixed",
        name: "Inactive fixed",
        valueAmount: "5",
        active: false,
      },
      {
        code: "EXPIRED10",
        kind: "fixed",
        name: "Expired fixed",
        valueAmount: "5",
        active: true,
        expiresAt: now - DAY,
      },
      {
        code: "FUTURE10",
        kind: "fixed",
        name: "Future fixed",
        valueAmount: "5",
        active: true,
        startsAt: now + DAY,
      },
    ]);

    const result = await couponsService.listAvailable();

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("SAVE10");
    expect(result[0].kind).toBe("percentage");
    expect(result.some((c) => "rep_daily" === (c as { kind: string }).kind)).toBe(false);
    expect(result[0]).not.toHaveProperty("redemptionCount");
    expect(result[0]).not.toHaveProperty("ownerUserId");
    expect(result[0]).not.toHaveProperty("istDate");
  });
});
