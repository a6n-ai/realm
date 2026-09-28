import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { mealPayout, mealSizeItems, mealSizes, orders, users, walletLedger } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { walletService } from "../wallet.service";
import { findOrCreateCustomMealSize } from "../custom-meal.service";

let regularUserId: bigint;
let customUserId: bigint;
const orderIds: bigint[] = [];
let ruleId: bigint;
let rulePublicId: string;
let createdSizeId: bigint | null = null;

beforeAll(async () => {
  const snap = await loadCatalogSnapshot();
  const regular = snap.mealSizes.find((m) => !m.custom)!;
  const before = new Set((await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.custom, true))).map((r) => r.id));
  const size = await findOrCreateCustomMealSize([{ category: "sabzi", planKey: "veg", tuAmount: 3 }], { actorId: null });
  if (!before.has(size.id)) createdSizeId = size.id;

  const [ru] = await db.insert(users).values({ email: "payout-regular@throwaway.local" }).returning();
  const [cu] = await db.insert(users).values({ email: "payout-custom@throwaway.local" }).returning();
  regularUserId = ru.id;
  customUserId = cu.id;

  const base = {
    planId: snap.plans[0].id, frequencyId: snap.frequencies[0].id, persons: 1,
    // No weeks-specific rule can match an unusual duration, so the default rule applies.
    durationWeeks: 97, startDate: "2031-01-06", tiffinCount: 5, perTiffinPrice: "10.00",
    pricingSnapshot: {}, total: "50.00", status: "active" as const,
    fullName: "Payout Test", addressLine: "1 Test St", city: "Toronto", postalCode: "M5V 2T6",
  };
  const inserted = await db.insert(orders).values([
    { ...base, userId: regularUserId, mealSizeId: regular.id, deploymentId: "PAYOUT-CM-01" },
    { ...base, userId: customUserId, mealSizeId: size.id, deploymentId: "PAYOUT-CM-02" },
  ]).returning({ id: orders.id });
  orderIds.push(...inserted.map((o) => o.id));

  const [rule] = await db.insert(mealPayout).values({ mealSizeId: null, durationPackageId: null, coins: 10 }).returning();
  ruleId = rule.id;
  rulePublicId = rule.publicId;
});

afterAll(async () => {
  await db.delete(walletLedger).where(like(walletLedger.sourceId, `${rulePublicId}:%`));
  await db.delete(mealPayout).where(eq(mealPayout.id, ruleId));
  await db.delete(orders).where(inArray(orders.id, orderIds));
  await db.delete(users).where(inArray(users.id, [regularUserId, customUserId]));
  if (createdSizeId !== null) {
    await db.delete(mealSizeItems).where(eq(mealSizeItems.mealSizeId, createdSizeId));
    await db.delete(mealSizes).where(eq(mealSizes.id, createdSizeId));
  }
});

describe("default meal payout rule", () => {
  it("skips custom-meal orders", async () => {
    await walletService.awardMealPayoutRule(ruleId);
    const rows = (userId: bigint) => db.select().from(walletLedger)
      .where(and(eq(walletLedger.userId, userId), eq(walletLedger.sourceType, "meal_payout")));
    expect(await rows(regularUserId)).toHaveLength(1);
    expect(await rows(customUserId)).toHaveLength(0);
  });
});
