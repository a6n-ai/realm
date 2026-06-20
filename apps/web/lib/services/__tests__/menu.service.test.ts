import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ValidationError } from "@tiffin/commons";
import { db } from "@/db/client";
import { dishes, mealSlots, menuItems, menuWeeks } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { menuService } = await import("../menu.service");

let weekPublicId: string; let dishPublicId: string; let weekBigintId: bigint;
async function reset() {
  await db.delete(menuItems); await db.delete(menuWeeks); await db.delete(dishes); await db.delete(mealSlots);
}
describe("menuService", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(mealSlots).values([{ key: "lunch", label: "Lunch", enabled: true, sortOrder: 1 }, { key: "dinner", label: "Dinner", enabled: false, sortOrder: 2 }]);
    const [d] = await db.insert(dishes).values({ name: "Paneer", diet: "veg", slots: ["lunch"] }).returning();
    dishPublicId = d.publicId;
    const w = await menuService.upsertWeek({ weekStart: "2026-06-22", orderCutoff: new Date("2026-06-21T18:00:00Z").toISOString() });
    weekPublicId = w.publicId;
    weekBigintId = w.id;
  });
  afterAll(reset);

  it("adds an item for an enabled slot", async () => {
    await menuService.addItem({ menuWeekId: weekPublicId, dayOfWeek: "mon", slot: "lunch", dishId: dishPublicId, isDefault: true });
    const rows = await db.select().from(menuItems).where(eq(menuItems.menuWeekId, weekBigintId));
    expect(rows).toHaveLength(1);
  });
  it("rejects an item for a disabled slot", async () => {
    await expect(menuService.addItem({ menuWeekId: weekPublicId, dayOfWeek: "mon", slot: "dinner", dishId: dishPublicId, isDefault: false }))
      .rejects.toBeInstanceOf(ValidationError);
  });
  it("release marks the week released", async () => {
    await menuService.release(weekPublicId);
    const [w] = await db.select().from(menuWeeks).where(eq(menuWeeks.id, weekBigintId));
    expect(w.status).toBe("released");
  });
});
