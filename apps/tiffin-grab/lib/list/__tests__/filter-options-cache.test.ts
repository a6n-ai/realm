import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { mealSizes } = await import("@/db/schema");
const { mealSizeService } = await import("@/lib/catalog/catalog.service");
const { loadOrderFilterOptions } = await import("../facet-options");

describe("filter options cache", () => {
  it("shows a renamed meal size in the orders filter on the next read", async () => {
    const [size] = await db.select().from(mealSizes).where(eq(mealSizes.custom, false)).limit(1);
    try {
      await loadOrderFilterOptions("all");
      await mealSizeService.update(size!.publicId, { name: "Filter Renamed" });
      const { sizeOptions } = await loadOrderFilterOptions("all");
      expect(sizeOptions.find((o) => o.value === size!.key)?.label).toBe("Filter Renamed");
    } finally {
      await mealSizeService.update(size!.publicId, { name: size!.name });
    }
  });
});
