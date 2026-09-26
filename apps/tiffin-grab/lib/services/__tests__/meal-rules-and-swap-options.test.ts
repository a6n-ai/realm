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
    // The legacy write also lays down the scope + conditions the engine reads,
    // so a rule saved from the existing admin grid is still enforced.
    const listed = await mealRulesService.listEnabledForOrder({ planId: plan!.id });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ action: "max_qualifying", actionValue: 1, matchMode: "all" });
    expect(listed[0]!.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "category", operator: "is", valueKeys: ["sabzi"] }),
        expect.objectContaining({ field: "dish_plan", operator: "is", valueIds: [plan!.id] }),
      ]),
    );
  });

  it("listValidSwapOptionsForDelivery rounds roti → rice down to whole rice within Max TU", async () => {
    const snap = await loadCatalogSnapshot();
    // Roti is one row per meal size; 5 Item Large's is 6 roti (1.5 TU).
    const size = snap.mealSizes.find((m) => m.key === "item5_large_nonveg")
      ?? snap.mealSizes.find((m) => m.key === "maharaja_nonveg")
      ?? snap.mealSizes.find((m) => {
        const roti = m.items.find((i) => i.category === "roti");
        return Number(roti?.tuAmount ?? 0) >= 1 && m.items.some((i) => i.category === "rice");
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
      // The one roti row (6 roti = 1.5 TU) rounds down to 1 rice; max 2 TU allows +1 rice.
      expect(rotiRice!.validBundles.map((b) => [b.fromPicks, b.toPicks])).toEqual([[1, 1]]);
    } finally {
      if (riceRow) await db.update(mealSizeItems).set({ maxTuAmount: prevMax }).where(eq(mealSizeItems.id, riceRow.id));
    }
  });
});
