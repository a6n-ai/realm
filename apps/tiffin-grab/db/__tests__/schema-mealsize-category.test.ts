import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { dishCategories } from "@/db/schema";
import { dishes, mealSizeItems, mealSizes } from "@/db/schema/catalog";
import { orders } from "@/db/schema/orders";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

const TEST_DEPLOYMENT_ID = "SUB-SCHEMA-CATCOUNTS";

async function cleanup() {
  await db.delete(orders).where(eq(orders.deploymentId, TEST_DEPLOYMENT_ID));
}

describe("schema: meal-size ↔ category delta (Task 1)", () => {
  afterAll(cleanup);

  it("orders.categoryCounts defaults to an empty object", async () => {
    await cleanup();
    const snap = await loadCatalogSnapshot();
    const [o] = await db
      .insert(orders)
      .values({
        planId: snap.plans[0].id,
        mealSizeId: snap.mealSizes[0].id,
        frequencyId: snap.frequencies[0].id,
        persons: 1,
        durationWeeks: 1,
        startDate: "2999-01-01",
        tiffinCount: 5,
        perTiffinPrice: "10.00",
        pricingSnapshot: {},
        total: "50.00",
        deploymentId: TEST_DEPLOYMENT_ID,
        fullName: "T",
        addressLine: "1",
        city: "Toronto",
        postalCode: "M5V 2T6",
      })
      .returning();
    expect(o.categoryCounts).toEqual({});
  });

  it("every seeded meal_size_items row has a non-empty category", async () => {
    const rows = await db.select({ category: mealSizeItems.category }).from(mealSizeItems);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(typeof r.category).toBe("string");
      expect(r.category.length).toBeGreaterThan(0);
    }
  });

  it("dish_categories contains daal, curry, extra for tiffin", async () => {
    for (const key of ["daal", "curry", "extra"]) {
      const [row] = await db
        .select({ key: dishCategories.key })
        .from(dishCategories)
        .where(and(eq(dishCategories.planType, "tiffin"), eq(dishCategories.key, key)));
      expect(row, `dish_categories tiffin/${key}`).toBeDefined();
    }
  });

  it("every seeded dishes row has a category", async () => {
    const rows = await db.select({ category: dishes.category }).from(dishes);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.category, "dish category").toBeTruthy();
    }
  });

  it("every seeded meal_sizes row has plan_type='tiffin'", async () => {
    const rows = await db.select({ planType: mealSizes.planType }).from(mealSizes);
    expect(rows.length).toBe(17);
    for (const r of rows) {
      expect(r.planType).toBe("tiffin");
    }
  });
});
