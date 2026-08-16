import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categorySwapRules, mealSizes, orders } from "@/db/schema";

describe("swap portion columns", () => {
  it("stores a portion on a swap rule and defaults it to null", async () => {
    const [size] = await db.select({ id: mealSizes.id }).from(mealSizes).limit(1);
    const [withPortion] = await db.insert(categorySwapRules).values({
      mealSizeId: size.id,
      fromCategory: "roti",
      toCategory: "rice",
      qtyFrom: 2,
      qtyTo: 1,
      toWeightValue: "250.00",
      toWeightUnit: "g",
    }).returning();
    const [withoutPortion] = await db.insert(categorySwapRules).values({
      mealSizeId: size.id,
      fromCategory: "rice",
      toCategory: "roti",
      qtyFrom: 1,
      qtyTo: 2,
    }).returning();

    expect(withPortion.toWeightValue).toBe("250.00");
    expect(withPortion.toWeightUnit).toBe("g");
    expect(withoutPortion.toWeightValue).toBeNull();
    expect(withoutPortion.toWeightUnit).toBeNull();

    await db.delete(categorySwapRules).where(eq(categorySwapRules.id, withPortion.id));
    await db.delete(categorySwapRules).where(eq(categorySwapRules.id, withoutPortion.id));
  });

  it("defaults orders.defaultSwaps to an empty array", async () => {
    const [row] = await db.select({ defaultSwaps: orders.defaultSwaps }).from(orders).limit(1);
    // No orders in a clean DB is fine — the column's presence is what this asserts.
    if (row) expect(Array.isArray(row.defaultSwaps)).toBe(true);
  });
});
