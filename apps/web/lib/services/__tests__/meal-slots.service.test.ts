import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { mealSlots } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { mealSlotsService } = await import("../meal-slots.service");

async function reset() { await db.delete(mealSlots); }

describe("mealSlotsService.enabledSlots", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(mealSlots).values([
      { key: "breakfast", label: "Breakfast", enabled: false, sortOrder: 0 },
      { key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
      { key: "dinner", label: "Dinner", enabled: false, sortOrder: 2 },
    ]);
  });
  afterAll(reset);

  it("returns only enabled slots in sort order", async () => {
    const slots = await mealSlotsService.enabledSlots();
    expect(slots.map((s) => s.key)).toEqual(["lunch"]);
  });
});

describe("mealSlotsService.forPlanType", () => {
  beforeEach(reset);
  afterAll(reset);

  it("forPlanType returns only that type's enabled slots, ordered", async () => {
    await db.insert(mealSlots).values([
      { planType: "tiffin", key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
      { planType: "healthy", key: "breakfast", label: "Breakfast", enabled: true, sortOrder: 0 },
      { planType: "healthy", key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
      { planType: "healthy", key: "dinner", label: "Dinner", enabled: false, sortOrder: 2 },
    ]);
    expect((await mealSlotsService.forPlanType("tiffin")).map((s) => s.key)).toEqual(["lunch"]);
    expect((await mealSlotsService.forPlanType("healthy")).map((s) => s.key)).toEqual(["breakfast", "lunch"]);
  });
  it("enabledSlots dedupes by key across types", async () => {
    await db.insert(mealSlots).values([
      { planType: "tiffin", key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
      { planType: "healthy", key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
      { planType: "healthy", key: "breakfast", label: "Breakfast", enabled: true, sortOrder: 0 },
    ]);
    const keys = (await mealSlotsService.enabledSlots()).map((s) => s.key);
    expect(keys).toEqual([...new Set(keys)]); // no dupes
    expect(keys).toContain("lunch"); expect(keys).toContain("breakfast");
  });
});
