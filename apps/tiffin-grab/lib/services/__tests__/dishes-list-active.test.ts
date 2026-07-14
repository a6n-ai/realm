import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const { db } = await import("@/db/client");
const { dishes } = await import("@/db/schema");

const IMG = { url: "/api/files/x.jpg", filePath: "x.jpg", fileName: "x.jpg", name: "x.jpg", type: "image/jpeg", isDirectory: false, size: 1 };

// Clean up only the rows this suite creates (scoped to our test dish names).
async function wipe() {
  await db.delete(dishes).where(eq(dishes.name, "TEST_DISH_A"));
  await db.delete(dishes).where(eq(dishes.name, "TEST_DISH_B"));
  await db.delete(dishes).where(eq(dishes.name, "TEST_DISH_C"));
}

describe("dishesService.listActiveWithImages", () => {
  beforeEach(wipe);
  afterAll(wipe);

  it("returns only active dishes that have an image", async () => {
    const { dishesService } = await import("../dishes.service");

    await db.insert(dishes).values({ name: "TEST_DISH_A", diet: "veg", image: IMG, active: true });
    await db.insert(dishes).values({ name: "TEST_DISH_B", diet: "veg", image: null, active: true });
    await db.insert(dishes).values({ name: "TEST_DISH_C", diet: "nonveg", image: IMG, active: false });

    const rows = await dishesService.listActiveWithImages();
    const names = rows.map((r) => r.name);
    expect(names).toContain("TEST_DISH_A");
    expect(names).not.toContain("TEST_DISH_B");
    expect(names).not.toContain("TEST_DISH_C");
    expect(rows.every((r) => r.image != null)).toBe(true);
  });
});
