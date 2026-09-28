import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const { db } = await import("@/db/client");
const { customMealPricing, mealSizeItems, mealSizes } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const svc = await import("../custom-meal.service");

async function reset() {
  const customs = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.custom, true));
  for (const c of customs) {
    await db.delete(mealSizeItems).where(eq(mealSizeItems.mealSizeId, c.id));
    await db.delete(mealSizes).where(eq(mealSizes.id, c.id));
  }
  await db.delete(customMealPricing);
}

describe("findOrCreateCustomMealSize", () => {
  beforeEach(reset);
  afterAll(reset);

  it("dedupes the same composition regardless of row order", async () => {
    const a = await svc.findOrCreateCustomMealSize([
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
      { category: "roti", planKey: "veg", tuAmount: 1 },
    ], { actorId: null });
    const b = await svc.findOrCreateCustomMealSize([
      { category: "roti", planKey: "veg", tuAmount: 1 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
    ], { actorId: null });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.id).toBe(a.id);
  });

  it("writes one meal_size_items row per pick, per-row planId, meal planId non-veg when mixed", async () => {
    const r = await svc.findOrCreateCustomMealSize([
      { category: "sabzi", planKey: "non-veg", tuAmount: 1.5 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
    ], { actorId: null });
    const snap = await loadCatalogSnapshot();
    const size = snap.mealSizes.find((m) => m.id === r.id);
    expect(size?.custom).toBe(true);
    expect(size?.planKey).toBe("non-veg");
    expect(size?.items.map((i) => i.category)).toEqual(["sabzi", "sabzi", "sabzi"]);
  });

  it("is visible to the catalog snapshot immediately (cache invalidated)", async () => {
    await loadCatalogSnapshot(); // warm the cache
    const r = await svc.findOrCreateCustomMealSize([{ category: "rice", planKey: "veg", tuAmount: 2 }], { actorId: null });
    expect((await loadCatalogSnapshot()).mealSizes.some((m) => m.id === r.id)).toBe(true);
  });

  it("rejects an unknown category", async () => {
    await expect(svc.findOrCreateCustomMealSize([{ category: "nope", planKey: "veg", tuAmount: 1 }], { actorId: null })).rejects.toThrow(/nope/);
  });
});

describe("upsertPricing", () => {
  beforeEach(reset);
  it("inserts then updates the (category, plan) row", async () => {
    await svc.upsertPricing({ categoryKey: "sabzi", planKey: "veg", pricePerTu: 3, maxTu: null, active: true }, null);
    await svc.upsertPricing({ categoryKey: "sabzi", planKey: "veg", pricePerTu: 3.5, maxTu: 4, active: true }, null);
    const rows = (await svc.loadPricingRows()).filter((r) => r.category === "sabzi" && r.planKey === "veg");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pricePerTu: 3.5, maxTu: 4 });
  });
});
