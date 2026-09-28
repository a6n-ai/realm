import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const { db } = await import("@/db/client");
const { customMealPricing, mealSizeItems, mealSizes } = await import("@/db/schema");
const { loadCatalogSnapshot, invalidateCatalogSnapshot } = await import("@/lib/catalog/load");
const { listableMealSizes } = await import("@/lib/catalog/types");
const { buildPricingCatalog } = await import("@/lib/pricing/build-catalog");
const svc = await import("@/lib/services/custom-meal.service");

async function reset() {
  for (const c of await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.custom, true))) {
    await db.delete(mealSizeItems).where(eq(mealSizeItems.mealSizeId, c.id));
    await db.delete(mealSizes).where(eq(mealSizes.id, c.id));
  }
  await db.delete(customMealPricing);
  await invalidateCatalogSnapshot();
}

const selections = (mealSizeId: string) => ({
  mealSizeId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
  includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate: "2030-01-07",
});

describe("custom meal sizes in the catalog snapshot", () => {
  beforeEach(reset);
  afterAll(reset);

  it("prices a custom size from custom_meal_pricing, not base_price", async () => {
    await svc.upsertPricing({ categoryKey: "sabzi", planKey: "veg", pricePerTu: 3, maxTu: null, active: true }, null);
    await svc.upsertPricing({ categoryKey: "roti", planKey: "veg", pricePerTu: 1, maxTu: null, active: true }, null);
    const r = await svc.findOrCreateCustomMealSize([
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
      { category: "roti", planKey: "veg", tuAmount: 1.5 },
    ], { actorId: null, basePrice: 999 });
    const size = (await loadCatalogSnapshot()).mealSizes.find((m) => m.id === r.id)!;
    expect(size).toMatchObject({ custom: true, priceable: true, basePrice: 4.5 });
  });

  it("repricing flows to the next snapshot load (renew path)", async () => {
    await svc.upsertPricing({ categoryKey: "rice", planKey: "veg", pricePerTu: 2, maxTu: null, active: true }, null);
    const r = await svc.findOrCreateCustomMealSize([{ category: "rice", planKey: "veg", tuAmount: 1 }], { actorId: null });
    await svc.upsertPricing({ categoryKey: "rice", planKey: "veg", pricePerTu: 2.5, maxTu: null, active: true }, null);
    expect((await loadCatalogSnapshot()).mealSizes.find((m) => m.id === r.id)!.basePrice).toBe(2.5);
  });

  it("keeps an unpriceable custom size in the snapshot but pricing refuses it", async () => {
    const r = await svc.findOrCreateCustomMealSize([{ category: "rice", planKey: "veg", tuAmount: 1 }], { actorId: null });
    const snap = await loadCatalogSnapshot();
    const size = snap.mealSizes.find((m) => m.id === r.id)!;
    expect(size.priceable).toBe(false);
    expect(() => buildPricingCatalog(snap, selections(size.publicId))).toThrow(/no longer available/);
  });

  it("listableMealSizes hides custom sizes except the kept one", async () => {
    // The kept size must be priceable: listableMealSizes also hides an unpriceable kept size.
    await svc.upsertPricing({ categoryKey: "rice", planKey: "veg", pricePerTu: 2, maxTu: null, active: true }, null);
    const r = await svc.findOrCreateCustomMealSize([{ category: "rice", planKey: "veg", tuAmount: 3 }], { actorId: null });
    const snap = await loadCatalogSnapshot();
    expect(listableMealSizes(snap.mealSizes).some((m) => m.custom)).toBe(false);
    expect(listableMealSizes(snap.mealSizes, r.publicId).filter((m) => m.custom).map((m) => m.publicId)).toEqual([r.publicId]);
    expect(listableMealSizes(snap.mealSizes).length).toBe(snap.mealSizes.filter((m) => !m.custom).length);
  });
});

it("listableMealSizes hides an unpriceable kept size", () => {
  const sizes = [{ publicId: "a", custom: false }, { publicId: "c", custom: true, priceable: false }];
  expect(listableMealSizes(sizes, "c").map((m) => m.publicId)).toEqual(["a"]);
});
