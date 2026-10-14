import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";

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

const DAY = "2026-10-14";
const issue = (ownerUserId: bigint, amount: number, over: { dailyUses?: number; capPct?: number } = {}) =>
  couponsService.issueRepCode({
    ownerUserId,
    istDate: DAY,
    amount,
    capPct: over.capPct ?? 20,
    capAmount: 25,
    dailyUses: over.dailyUses ?? 2,
    expiresAt: Date.now() + 3_600_000,
  });

describe("staff-issued one-off codes", () => {
  beforeEach(reset);
  afterAll(reset);

  const staff = async () => (await db.insert(users).values({ email: "rep@x.com", role: "member" }).returning())[0]!;

  it("issues a hidden, single-use, stackable code owned by the staff member", async () => {
    const rep = await staff();
    const { code, usedToday } = await issue(rep.id, 10);
    expect(code).toMatch(/^TG-[A-Z2-9]{6}$/);
    expect(usedToday).toBe(1);

    const [row] = await db.select().from(coupons).where(eq(coupons.code, code));
    expect(row).toMatchObject({ kind: "rep_code", valueAmount: "10.00", maxRedemptions: 1, stackable: true, autoApply: false, visible: false, ownerUserId: rep.id });
    expect((await couponsService.listAvailable()).map((c) => c.code)).not.toContain(code);
  });

  it("refuses an amount over the ceiling and a code past the daily count", async () => {
    const rep = await staff();
    await expect(issue(rep.id, 25.01)).rejects.toThrow("up to $25.00");
    await expect(issue(rep.id, 0)).rejects.toThrow("Enter a discount amount");

    await issue(rep.id, 5);
    await issue(rep.id, 5);
    await expect(issue(rep.id, 5)).rejects.toThrow("today's discount limit");
  });

  it("shares the daily count with the rep's applied daily coupon", async () => {
    const rep = await staff();
    await db.insert(coupons).values({ code: "REP-DAY", kind: "rep_daily", name: "Rep daily", capPct: "20", capAmount: "25", maxRedemptions: 2, redemptionCount: 1, ownerUserId: rep.id, istDate: DAY });
    await issue(rep.id, 5);
    await expect(issue(rep.id, 5)).rejects.toThrow("today's discount limit");
    // The applied lane sees the issued code too.
    await expect(couponsService.validateRepCoupon("REP-DAY", { subtotal: 100, requestedAmount: 5, actorId: rep.id })).rejects.toThrow("today's discount limit");
  });

  it("gives the issued amount at checkout, clamped to the percent ceiling", async () => {
    const rep = await staff();
    const { code } = await issue(rep.id, 20, { capPct: 10 });

    const full = await couponsService.resolveBestCoupons({ subtotal: 300, manualCode: code });
    expect(full.redemptions.map((r) => [r.coupon.code, r.amount])).toEqual([[code, 20]]);

    const clamped = await couponsService.resolveBestCoupons({ subtotal: 100, manualCode: code });
    expect(clamped.redemptions[0]!.amount).toBe(10);
  });

  it("stacks on top of every auto coupon, exclusive ones included, with the ceiling judged on what is left", async () => {
    const rep = await staff();
    const { code } = await issue(rep.id, 20, { capPct: 10 });
    await db.insert(coupons).values({ code: "SOLO100", kind: "fixed", name: "Solo", valueAmount: "100", autoApply: true, stackable: false });

    const r = await couponsService.resolveBestCoupons({ subtotal: 250, manualCode: code });
    // 250 - 100 leaves 150; 10% of that is 15, under the $20 issued.
    expect(r.redemptions.map((x) => [x.coupon.code, x.amount])).toEqual([["SOLO100", 100], [code, 15]]);
  });
});
