import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const { db } = await import("@/db/client");
const { mealSizeItems, mealSizes } = await import("@/db/schema");
const { dishCategoriesService } = await import("../dish-categories.service");
const svc = await import("../custom-meal.service");

describe("custom meals never swap", () => {
  const createdIds: bigint[] = [];

  afterAll(async () => {
    for (const id of createdIds) {
      await db.delete(mealSizeItems).where(eq(mealSizeItems.mealSizeId, id));
      await db.delete(mealSizes).where(eq(mealSizes.id, id));
    }
  });

  it("returns no pairs even when a global sabzi>daal rule exists", async () => {
    const r = await svc.findOrCreateCustomMealSize([
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
      { category: "daal", planKey: "veg", tuAmount: 1 },
      { category: "roti", planKey: "veg", tuAmount: 1 },
      { category: "rice", planKey: "veg", tuAmount: 1 },
    ], { actorId: null });
    if (r.created) createdIds.push(r.id);
    expect(await dishCategoriesService.swapPairsForMealSize(r.id)).toEqual([]);
    expect(await dishCategoriesService.swapPairOverridesForMealSize("roti", "rice", r.id)).toBeNull();
  });
});
