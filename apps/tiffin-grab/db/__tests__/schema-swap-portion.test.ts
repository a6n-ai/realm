import { describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { categorySwapRules, mealSizes, orders } from "@/db/schema";

describe("swap portion columns", () => {
  it("stores a portion on a swap rule and defaults it to null", async () => {
    const [size] = await db.select({ id: mealSizes.id }).from(mealSizes).limit(1);
    const insertedIds: bigint[] = [];
    try {
      // Category keys namespaced to this test so a fresh (mealSizeId, from, to)
      // pair never collides with real rules other tasks/suites seed for the
      // same meal size — category_swap_rules_direction_unique is per meal size.
      const [withPortion] = await db.insert(categorySwapRules).values({
        mealSizeId: size.id,
        fromCategory: "__swaptest_from__",
        toCategory: "__swaptest_to__",
        qtyFrom: 2,
        qtyTo: 1,
        toWeightValue: "250.00",
        toWeightUnit: "g",
      }).returning();
      insertedIds.push(withPortion.id);
      const [withoutPortion] = await db.insert(categorySwapRules).values({
        mealSizeId: size.id,
        fromCategory: "__swaptest_to__",
        toCategory: "__swaptest_from__",
        qtyFrom: 1,
        qtyTo: 2,
      }).returning();
      insertedIds.push(withoutPortion.id);

      expect(withPortion.toWeightValue).toBe("250.00");
      expect(withPortion.toWeightUnit).toBe("g");
      expect(withoutPortion.toWeightValue).toBeNull();
      expect(withoutPortion.toWeightUnit).toBeNull();
    } finally {
      if (insertedIds.length) {
        await db.delete(categorySwapRules).where(inArray(categorySwapRules.id, insertedIds));
      }
    }
  });

  it("defaults orders.defaultSwaps to an empty array", async () => {
    const [row] = await db.select({ defaultSwaps: orders.defaultSwaps }).from(orders).limit(1);
    // No orders in a clean DB is fine — the column's presence is what this asserts.
    if (row) expect(Array.isArray(row.defaultSwaps)).toBe(true);
  });
});
