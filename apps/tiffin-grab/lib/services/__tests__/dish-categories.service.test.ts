import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { dishCategories } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { dishCategoriesService } = await import("../dish-categories.service");

async function reset() { await db.delete(dishCategories); }

describe("dishCategoriesService.enabledCategories", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(dishCategories).values([
      { key: "breakfast", label: "Breakfast", enabled: false, sortOrder: 0 },
      { key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
      { key: "dinner", label: "Dinner", enabled: false, sortOrder: 2 },
    ]);
  });
  afterAll(reset);

  it("returns only enabled categories in sort order", async () => {
    const categories = await dishCategoriesService.enabledCategories();
    expect(categories.map((c) => c.key)).toEqual(["lunch"]);
  });
});

describe("dishCategoriesService.forPlanType", () => {
  beforeEach(reset);
  afterAll(reset);

  it("forPlanType returns only that type's enabled categories, ordered", async () => {
    await db.insert(dishCategories).values([
      { planType: "tiffin", key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
      { planType: "healthy", key: "breakfast", label: "Breakfast", enabled: true, sortOrder: 0 },
      { planType: "healthy", key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
      { planType: "healthy", key: "dinner", label: "Dinner", enabled: false, sortOrder: 2 },
    ]);
    expect((await dishCategoriesService.forPlanType("tiffin")).map((c) => c.key)).toEqual(["lunch"]);
    expect((await dishCategoriesService.forPlanType("healthy")).map((c) => c.key)).toEqual(["breakfast", "lunch"]);
  });

  it("enabledCategories dedupes by key across types", async () => {
    await db.insert(dishCategories).values([
      { planType: "tiffin", key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
      { planType: "healthy", key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
      { planType: "healthy", key: "breakfast", label: "Breakfast", enabled: true, sortOrder: 0 },
    ]);
    const keys = (await dishCategoriesService.enabledCategories()).map((c) => c.key);
    expect(keys).toEqual([...new Set(keys)]); // no dupes
    expect(keys).toContain("lunch"); expect(keys).toContain("breakfast");
  });

  it("surfaces selectable flag on forPlanType rows", async () => {
    await db.insert(dishCategories).values([
      { planType: "tiffin", key: "sabzi", label: "Sabzi", enabled: true, selectable: true, sortOrder: 0 },
      { planType: "tiffin", key: "roti", label: "Roti", enabled: true, selectable: false, sortOrder: 1 },
    ]);
    const rows = await dishCategoriesService.forPlanType("tiffin");
    for (const row of rows) expect(typeof row.selectable).toBe("boolean");
    expect(rows.find((r) => r.key === "sabzi")?.selectable).toBe(true);
  });
});
