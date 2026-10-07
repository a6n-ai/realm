import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const { db } = await import("@/db/client");
const { mealSizeItems, mealSizes } = await import("@/db/schema");
const { dishCategoriesService } = await import("../dish-categories.service");
const svc = await import("../custom-meal.service");

describe("custom meals swap like catalog meals", () => {
  const createdIds: bigint[] = [];

  afterAll(async () => {
    for (const id of createdIds) {
      await db.delete(mealSizeItems).where(eq(mealSizeItems.mealSizeId, id));
      await db.delete(mealSizes).where(eq(mealSizes.id, id));
    }
  });

  it("offers the same rule-driven pairs as any meal on its plan", async () => {
    const r = await svc.findOrCreateCustomMealSize([
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
      { category: "daal", planKey: "veg", tuAmount: 1 },
      { category: "roti", planKey: "veg", tuAmount: 1 },
      { category: "rice", planKey: "veg", tuAmount: 1 },
    ], { actorId: null });
    if (r.created) createdIds.push(r.id);
    const pairs = (await dishCategoriesService.swapPairsForMealSize(r.id)).map((p) => `${p.fromCategory}>${p.toCategory}`);
    expect(pairs).toEqual(expect.arrayContaining(["sabzi>daal", "daal>sabzi", "roti>rice", "rice>roti"]));
    expect(await dishCategoriesService.swapPairRuleForMealSize("roti", "rice", r.id)).not.toBeNull();
  });
});
