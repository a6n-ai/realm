import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { mealSizes } = await import("@/db/schema");
const { mealSizeService } = await import("@/lib/catalog/catalog.service");
const { evictTestCaches } = await import("@/db/test-helpers");
const { mealSizeFacts } = await import("../meal-size-facts");

describe("meal size facts cache", () => {
  it("shows new allowed days on the next read", async () => {
    const [size] = await db.select().from(mealSizes).where(eq(mealSizes.custom, false)).limit(1);
    try {
      await mealSizeFacts(size!.id);
      await mealSizeService.update(size!.publicId, { allowedDays: ["mon", "tue"] });
      expect((await mealSizeFacts(size!.id))?.allowedDays).toEqual(["mon", "tue"]);
    } finally {
      await db.update(mealSizes).set({ allowedDays: size!.allowedDays }).where(eq(mealSizes.id, size!.id));
      await evictTestCaches();
    }
  });
});
