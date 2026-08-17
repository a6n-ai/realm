import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categorySwapRules, dishCategories, mealSizes } from "@/db/schema";
import { createSwapRule } from "../category-swap-rules.service";
import { dishCategoriesService } from "../dish-categories.service";

const created: bigint[] = [];
const createdCategories: bigint[] = [];
afterEach(async () => {
  for (const id of created.splice(0)) await db.delete(categorySwapRules).where(eq(categorySwapRules.id, id));
  for (const id of createdCategories.splice(0)) await db.delete(dishCategories).where(eq(dishCategories.id, id));
});

describe("createSwapRule category validation", () => {
  it("rejects a category not on the meal size's own plan", async () => {
    const [size] = await db.select({ id: mealSizes.id, planId: mealSizes.planId }).from(mealSizes).limit(1);
    const planCats = await dishCategoriesService.forPlan(size.planId);
    expect(planCats.length).toBeGreaterThan(0);

    // An enabled category deliberately left off every plan's category_plans
    // membership — no rule for it should ever be creatable against this size.
    const [outsider] = await db.insert(dishCategories).values({
      key: `swap-test-outsider-${Date.now()}`,
      label: "Swap Test Outsider",
      enabled: true,
      selectable: true,
      sortOrder: 0,
    }).returning();
    createdCategories.push(outsider.id);

    await expect(createSwapRule({
      mealSizeId: size.id,
      fromCategory: planCats[0].key,
      toCategory: outsider.key,
      qtyFrom: 1,
      qtyTo: 1,
    })).rejects.toThrow(/not on this meal size's plan/i);
  });

  it("accepts a swap between two categories that are both on the meal size's plan", async () => {
    const [size] = await db.select({ id: mealSizes.id, planId: mealSizes.planId }).from(mealSizes).limit(1);
    const planCats = await dishCategoriesService.forPlan(size.planId);
    if (planCats.length < 2) return;

    const rule = await createSwapRule({
      mealSizeId: size.id,
      fromCategory: planCats[0].key,
      toCategory: planCats[1].key,
      qtyFrom: 1,
      qtyTo: 1,
    });
    created.push(rule.id);

    expect(rule.fromCategory).toBe(planCats[0].key);
    expect(rule.toCategory).toBe(planCats[1].key);
  });
});
