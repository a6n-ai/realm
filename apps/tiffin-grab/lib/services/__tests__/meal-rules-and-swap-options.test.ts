import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, mealRules, mealSizeItems, mealSizes, orders, payments, plans, users } = await import("@/db/schema");
const { loadCatalogSnapshot, invalidateCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { mealRulesService } = await import("../meal-rules.service");
const { listValidSwapOptionsForDelivery } = await import("../swap-options.service");
const { dishCategoriesService } = await import("../dish-categories.service");

const createdOrderIds: bigint[] = [];
const createdUserIds: bigint[] = [];
const createdRuleIds: string[] = [];

afterEach(async () => {
  const orderIds = createdOrderIds.splice(0);
  const userIds = createdUserIds.splice(0);
  const ruleIds = createdRuleIds.splice(0);
  if (orderIds.length) {
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, orderIds));
    await db.delete(payments).where(inArray(payments.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }
  if (ruleIds.length) await db.delete(mealRules).where(inArray(mealRules.publicId, ruleIds));
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  await invalidateCatalogSnapshot();
});

function orderInput(mealSizeId: string, planKey: string) {
  return {
    planKey,
    selections: {
      mealSizeId,
      frequencyKey: "5_day" as const,
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: {
      email: `u${Math.random().toString(36).slice(2)}@test.invalid`,
      fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6",
    },
  };
}

describe("mealRulesService + swap options", () => {
  it("upserts exclusive_to_plan rule without hardcoding dish names", async () => {
    const [plan] = await db.select().from(plans).where(eq(plans.key, "non-veg")).limit(1);
    expect(plan).toBeDefined();
    const { publicId } = await mealRulesService.upsert({
      planId: plan!.id,
      categoryKey: "sabzi",
      condition: "exclusive_to_plan",
      maxCount: 1,
    });
    createdRuleIds.push(publicId);
    const listed = await mealRulesService.listEnabledForPlan(plan!.id);
    expect(listed).toEqual([{ categoryKey: "sabzi", condition: "exclusive_to_plan", maxCount: 1 }]);
  });

  it("listValidSwapOptionsForDelivery only returns divisible bundles within Max TU", async () => {
    const snap = await loadCatalogSnapshot();
    // Need enough roti picks that 4-roti bundles exist (item4_regular only has 2).
    const size = snap.mealSizes.find((m) => m.key === "item5_large_nonveg")
      ?? snap.mealSizes.find((m) => m.key === "maharaja_nonveg")
      ?? snap.mealSizes.find((m) => {
        const roti = m.items.filter((i) => i.category === "roti").length;
        return roti >= 4 && m.items.some((i) => i.category === "rice");
      });
    if (!size) throw new Error("Need a meal size with rice + ≥4 roti");
    const plan = snap.plans.find((p) => p.id === size.planId)!;
    const planKey = plan.key;

    const [{ id: mealSizeId }] = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.publicId, size.publicId)).limit(1);
    const [riceRow] = await db.select().from(mealSizeItems).where(and(eq(mealSizeItems.mealSizeId, mealSizeId), eq(mealSizeItems.category, "rice"))).limit(1);
    const prevMax = riceRow?.maxTuAmount ?? null;
    if (riceRow) await db.update(mealSizeItems).set({ maxTuAmount: "2" }).where(eq(mealSizeItems.id, riceRow.id));

    if (!(await dishCategoriesService.swapPairExists("roti", "rice", plan.id))) {
      await dishCategoriesService.addSwapPair("roti", "rice", plan.publicId);
    }

    try {
      const { publicId } = await createOrder(orderInput(size.publicId, planKey));
      const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
      createdOrderIds.push(order.id);
      if (order.userId) createdUserIds.push(order.userId);
      const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);

      const options = await listValidSwapOptionsForDelivery(delivery.publicId, { hideUnavailable: true });
      const rotiRice = options.find((o) => o.fromCategory === "roti" && o.toCategory === "rice");
      expect(rotiRice?.available).toBe(true);
      expect(rotiRice!.validBundles.every((b) => b.fromPicks % 4 === 0)).toBe(true);
      expect(rotiRice!.validBundles.some((b) => b.fromPicks === 1)).toBe(false);
      // Base rice = 1 TU, max = 2 → at most +1 rice pick from swaps.
      expect(rotiRice!.validBundles.every((b) => b.toPicks <= 1)).toBe(true);
      expect(rotiRice!.maxFromPicks).toBe(4);
    } finally {
      if (riceRow) await db.update(mealSizeItems).set({ maxTuAmount: prevMax }).where(eq(mealSizeItems.id, riceRow.id));
    }
  });
});
