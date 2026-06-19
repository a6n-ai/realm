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
