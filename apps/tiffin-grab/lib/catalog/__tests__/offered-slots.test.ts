import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { dishCategories } from "@/db/schema";
import { attachAllCategoriesToPlans } from "@/db/test-helpers";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { loadCatalogSnapshot, invalidateCatalogSnapshot } = await import("../load");

async function reset() { await db.delete(dishCategories); }

describe("catalog offeredSlots derives from dish categories", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(dishCategories).values([
      { key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
      { key: "dinner", label: "Dinner", enabled: true, sortOrder: 2 },
    ]);
  await attachAllCategoriesToPlans();
    await invalidateCatalogSnapshot();
  });
  afterAll(reset);

  it("healthy plans expose the configured healthy categories", async () => {
    const snap = await loadCatalogSnapshot();
    const healthy = snap.plans.find((p) => p.planType === "healthy");
    expect(healthy).toBeDefined();
    expect(healthy!.offeredSlots).toEqual(["lunch", "dinner"]);
  });
});
