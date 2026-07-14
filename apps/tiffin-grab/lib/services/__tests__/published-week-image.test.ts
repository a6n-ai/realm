import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const { db } = await import("@/db/client");
const { dishes, menuWeeks, menuItems } = await import("@/db/schema");
const { menuService } = await import("../menu.service");

const IMG = { url: "/api/files/x.jpg", filePath: "x.jpg", fileName: "x.jpg", name: "x.jpg", type: "image/jpeg", isDirectory: false, size: 1 };

// Clean up only the rows this suite creates (match on a test-unique name prefix).
async function wipe() {
  await db.delete(menuItems); // no unique test marker; safe on serial local DB
  await db.delete(menuWeeks);
  await db.delete(dishes).where(eq(dishes.name, "TEST_DISH_A")); // scope dish cleanup to our names
}

describe("menuService.getPublishedWeek — dish image + publicId", () => {
  beforeEach(async () => {
    await wipe();
    await menuService.evictPublishedCache();
  });
  afterAll(wipe);

  it("carries dish image + publicId on each item", async () => {
    const [dish] = await db.insert(dishes).values({ name: "TEST_DISH_A", diet: "veg", image: IMG, active: true }).returning();
    const [week] = await db.insert(menuWeeks).values({ planType: "tiffin", weekStart: "2099-06-01", status: "released", orderCutoff: 0 }).returning();
    await db.insert(menuItems).values({ menuWeekId: week!.id, dayOfWeek: "mon", slot: "sabzi", dishId: dish!.id, position: 0 });

    const week_ = await menuService.getPublishedWeek("tiffin");
    expect(week_).not.toBeNull();
    const item = week_!.items.find((i) => i.dishName === "TEST_DISH_A");
    expect(item?.image).toMatchObject({ url: IMG.url });
    expect(item?.dishPublicId).toBeTruthy();
  });
});
