import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categorySwapRules, mealSizes } from "@/db/schema";
import { createSwapRule } from "../category-swap-rules.service";
import { loadCatalogSnapshot, invalidateCatalogSnapshot } from "@/lib/catalog/load";
import { dishCategoriesService } from "../dish-categories.service";

const created: bigint[] = [];
afterEach(async () => {
  for (const id of created.splice(0)) await db.delete(categorySwapRules).where(eq(categorySwapRules.id, id));
  await invalidateCatalogSnapshot();
});

describe("swap rule portions", () => {
  it("stores a portion and exposes the rule on the catalog snapshot", async () => {
    const [size] = await db.select({ id: mealSizes.id, publicId: mealSizes.publicId }).from(mealSizes).limit(1);
    const cats = await dishCategoriesService.enabledCategories();
    const [from, to] = cats;

    const rule = await createSwapRule({
      mealSizeId: size.id,
      fromCategory: from.key,
      toCategory: to.key,
      qtyFrom: 2,
      qtyTo: 1,
      toWeightValue: 250,
      toWeightUnit: "g",
    });
    created.push(rule.id);

    await invalidateCatalogSnapshot();
    const snap = await loadCatalogSnapshot();
    const view = snap.mealSizes.find((m) => m.publicId === size.publicId)!;
    const onSnapshot = view.swapRules.find((r) => r.publicId === rule.publicId)!;

    expect(onSnapshot.qtyFrom).toBe(2);
    expect(onSnapshot.toWeightValue).toBe(250);
    expect(onSnapshot.toWeightUnit).toBe("g");
  });

  it("rejects a portion value without a unit", async () => {
    const [size] = await db.select({ id: mealSizes.id }).from(mealSizes).limit(1);
    const cats = await dishCategoriesService.enabledCategories();
    await expect(createSwapRule({
      mealSizeId: size.id,
      fromCategory: cats[0].key,
      toCategory: cats[1].key,
      qtyFrom: 1,
      qtyTo: 1,
      toWeightValue: 250,
      toWeightUnit: null,
    })).rejects.toThrow(/unit/i);
  });
});
