import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dishCategories } from "@/db/schema";
import { attachAllCategoriesToPlans } from "@/db/test-helpers";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { loadCatalogSnapshot, invalidateCatalogSnapshot } = await import("../load");

const OWN_KEYS = ["lunch", "dinner"];

// menu_items.category_id is a foreign key now, so deleting the seeded categories wholesale
// breaks every later suite that places a dish in one. Own rows are removed; the seeded rest
// are only hidden (enabled=false) for the duration and switched back on afterwards.
async function reset() {
  await db.delete(dishCategories).where(inArray(dishCategories.key, OWN_KEYS));
  await db.update(dishCategories).set({ enabled: true });
}

async function isolate() {
  await db.delete(dishCategories).where(inArray(dishCategories.key, OWN_KEYS));
  await db.update(dishCategories).set({ enabled: false }).where(sql`true`);
}

describe("catalog offeredSlots derives from dish categories", () => {
  beforeEach(async () => {
    await isolate();
    await db.insert(dishCategories).values([
      { key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 },
      { key: "dinner", label: "Dinner", enabled: true, sortOrder: 2 },
    ]);
  await attachAllCategoriesToPlans();
    await invalidateCatalogSnapshot();
  });
  afterAll(reset);

  it("tiffin plans expose the configured categories", async () => {
    const snap = await loadCatalogSnapshot();
    const tiffin = snap.plans.find((p) => p.planType === "tiffin");
    expect(tiffin).toBeDefined();
    expect(tiffin!.offeredSlots).toEqual(["lunch", "dinner"]);
  });
});
