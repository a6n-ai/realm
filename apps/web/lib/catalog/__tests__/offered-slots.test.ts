import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { mealSlots } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { loadCatalogSnapshot, invalidateCatalogSnapshot } = await import("../load");

async function reset() { await db.delete(mealSlots); }

describe("catalog offeredSlots derives from meal slots", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(mealSlots).values([
      { planType: "healthy", key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
      { planType: "healthy", key: "dinner", label: "Dinner", enabled: true, sortOrder: 2 },
    ]);
    await invalidateCatalogSnapshot();
  });
  afterAll(reset);

  it("healthy plans expose the configured healthy slots", async () => {
    const snap = await loadCatalogSnapshot();
    const healthy = snap.plans.find((p) => p.planType === "healthy");
    expect(healthy).toBeDefined();
    expect(healthy!.offeredSlots).toEqual(["lunch", "dinner"]);
  });
});
