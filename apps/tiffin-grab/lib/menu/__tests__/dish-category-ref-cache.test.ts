import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { dishCategories } = await import("@/db/schema");
const { dishCategoriesService } = await import("../dish-categories.service");

describe("dish category ref cache", () => {
  it("shows a renamed category on the next read", async () => {
    const [cat] = await db.select().from(dishCategories).where(eq(dishCategories.key, "sabzi")).limit(1);
    try {
      await dishCategoriesService.update(cat!.publicId, { active: true });
      expect((await dishCategoriesService.enabledCategories()).some((c) => c.key === "sabzi")).toBe(true);
      await dishCategoriesService.update(cat!.publicId, { label: "Sabzi Renamed" });
      expect((await dishCategoriesService.enabledCategories()).find((c) => c.key === "sabzi")?.label).toBe("Sabzi Renamed");
    } finally {
      await dishCategoriesService.update(cat!.publicId, { label: cat!.label });
      await dishCategoriesService.update(cat!.publicId, { active: cat!.enabled });
    }
  });
});
