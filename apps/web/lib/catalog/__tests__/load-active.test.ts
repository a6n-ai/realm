import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mealSizes } from "@/db/schema";
import { loadCatalogSnapshot } from "../load";

describe("loadCatalogSnapshot active filter", () => {
  let restoreId: bigint | null = null;

  beforeEach(async () => {
    const rows = await db.select().from(mealSizes).limit(1);
    if (rows[0]) {
      restoreId = rows[0].id;
      await db.update(mealSizes).set({ active: false }).where(eq(mealSizes.id, rows[0].id));
    }
  });
  afterAll(async () => {
    if (restoreId) await db.update(mealSizes).set({ active: true }).where(eq(mealSizes.id, restoreId));
  });

  it("excludes inactive meal sizes", async () => {
    if (!restoreId) return;
    const snap = await loadCatalogSnapshot();
    expect(snap.mealSizes.find((m) => m.id === restoreId)).toBeUndefined();
  });
});
