import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { mealSizes } from "@/db/schema";
import { loadCatalogSnapshot } from "../load";

const WEIGHT_UNITS = new Set(["oz", "g", "ml", "piece"]);

describe("loadCatalogSnapshot items + trial", () => {
  it("populates structured items[] and trial for every meal size", async () => {
    const seeded = await db.select().from(mealSizes).limit(1);
    if (!seeded[0]) return; // skip against an unseeded DB

    const snap = await loadCatalogSnapshot();

    expect(snap.mealSizes.length).toBeGreaterThanOrEqual(17);

    const trialVeg = snap.mealSizes.find((m) => m.key === "trial_veg");
    const trialNonveg = snap.mealSizes.find((m) => m.key === "trial_nonveg");
    expect(trialVeg?.trial).toBe(true);
    expect(trialNonveg?.trial).toBe(true);

    for (const m of snap.mealSizes) {
      expect(m.items.length).toBeGreaterThan(0);
      for (const item of m.items) {
        expect(item.name.length).toBeGreaterThan(0);
        if (item.weightUnit !== null) {
          expect(WEIGHT_UNITS.has(item.weightUnit)).toBe(true);
        }
      }
      expect(m.components.length).toBeGreaterThan(0);

      if (m.diet === "veg") expect(m.diet).toBe("veg");
      if (m.diet === "nonveg") expect(m.diet).toBe("nonveg");
      expect(m.diet).not.toBe("both");
    }
  });
});
