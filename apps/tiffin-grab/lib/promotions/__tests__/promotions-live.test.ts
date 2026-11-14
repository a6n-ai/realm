import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { coupons, couponRedemptions, ledgerEntries, promotions } = await import("@/db/schema");
const { promotionsService } = await import("../promotions.service");

async function reset() {
  await db.delete(promotions);
  await db.delete(ledgerEntries);
  await db.delete(couponRedemptions);
  await db.delete(coupons);
}

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

async function promoWith(code: string, over: Partial<typeof coupons.$inferInsert>) {
  await db.insert(coupons).values({ code, kind: "fixed", name: code, valueAmount: "10", active: true, ...over });
  await db.insert(promotions).values({ title: `P ${code}`, couponCode: code, placements: ["home"], active: true });
  return (await promotionsService.listLive(now)).map((p) => p.couponCode);
}

describe("promotionsService.listLive with a linked coupon", () => {
  beforeEach(reset);
  afterAll(reset);

  it("keeps a promotion whose coupon is redeemable", async () => {
    expect(await promoWith("OKAY", { expiresAt: now + DAY, maxRedemptions: 5, redemptionCount: 1 })).toEqual(["OKAY"]);
  });

  it.each([
    ["inactive", { active: false }],
    ["expired", { expiresAt: now - DAY }],
    ["not started", { startsAt: now + DAY }],
    ["exhausted", { maxRedemptions: 3, redemptionCount: 3 }],
  ] as const)("drops a promotion whose coupon is %s", async (_n, over) => {
    expect(await promoWith("DEAD", over)).toEqual([]);
  });

  it("keeps a promotion with no coupon", async () => {
    await db.insert(promotions).values({ title: "Plain", placements: ["home"], active: true });
    expect(await promotionsService.listLive(now)).toHaveLength(1);
  });

  it("refuses linking a coupon that expires before the promotion ends", async () => {
    await db.insert(coupons).values({ code: "SOON", kind: "fixed", name: "Soon", valueAmount: "10", active: true, expiresAt: now + DAY });
    await expect(promotionsService.assertLinkableCoupon("SOON", now + 2 * DAY)).rejects.toBeInstanceOf(ValidationError);
    await expect(promotionsService.assertLinkableCoupon("SOON", null)).rejects.toBeInstanceOf(ValidationError);
    await expect(promotionsService.assertLinkableCoupon("SOON", now + DAY)).resolves.toBe("SOON");
  });
});
