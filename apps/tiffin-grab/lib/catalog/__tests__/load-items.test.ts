import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { mealSizes } from "@/db/schema";
import { loadCatalogSnapshot } from "../load";

describe("loadCatalogSnapshot items + trial", () => {
  it("populates structured items[] and a boolean trial flag for every meal size", async () => {
    const seeded = await db.select().from(mealSizes).limit(1);
    if (!seeded[0]) return; // skip against an unseeded DB

    const snap = await loadCatalogSnapshot();

    expect(snap.mealSizes.length).toBeGreaterThanOrEqual(17);

    // seed.sql: the sheet has no trial meal, so the flag must load as a real boolean.
    for (const m of snap.mealSizes) expect(typeof m.trial).toBe("boolean");

    for (const m of snap.mealSizes) {
      expect(m.items.length).toBeGreaterThan(0);
      for (const item of m.items) {
        expect(item.name.length).toBeGreaterThan(0);
        expect(item.tuAmount).toBeGreaterThan(0);
      }
      expect(m.components.length).toBeGreaterThan(0);

      expect(["veg", "non-veg"]).toContain(m.planKey);
    }
  });
});
