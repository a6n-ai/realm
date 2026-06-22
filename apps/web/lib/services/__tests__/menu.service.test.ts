import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { auditLog, dishes, mealSlots, menuItems, menuWeeks } = await import("@/db/schema");
const { menuService } = await import("../menu.service");

async function reset() {
  await db.delete(auditLog);
  await db.delete(menuItems);
  await db.delete(menuWeeks);
  await db.delete(dishes);
  await db.delete(mealSlots);
}

describe("menuService (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("upsertWeek creates then updates a week", async () => {
    const w = await menuService.upsertWeek({ weekStart: "2099-01-05", orderCutoff: "2099-01-04T18:00:00Z" });
    expect(w.weekStart).toBe("2099-01-05");
    const again = await menuService.upsertWeek({ weekStart: "2099-01-05", orderCutoff: "2099-01-03T18:00:00Z" });
    expect(again.publicId).toBe(w.publicId);
    expect(again.orderCutoff).toBe(new Date("2099-01-03T18:00:00Z").getTime());
  });

  it("addItem inserts and is idempotent on the composite key; removeItem deletes", async () => {
    await db.insert(mealSlots).values({ key: "lunch", label: "Lunch", enabled: true });
    const [d] = await db.insert(dishes).values({ name: "Test Dish", diet: "veg", slots: ["lunch"] }).returning();
    const w = await menuService.upsertWeek({ weekStart: "2099-01-12", orderCutoff: "2099-01-11T18:00:00Z" });
    const item = await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "lunch", dishId: d.publicId, isDefault: true });
    expect(item).toBeTruthy();
    const dup = await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "lunch", dishId: d.publicId, isDefault: true });
    expect(dup).toBeNull(); // idempotent: already exists
    await menuService.removeItem(item!.publicId);
    const remaining = await db.select().from(menuItems).where(eq(menuItems.menuWeekId, (await db.select({ id: menuWeeks.id }).from(menuWeeks).where(eq(menuWeeks.publicId, w.publicId)))[0].id));
    expect(remaining).toHaveLength(0);
  });

  it("entity writes produce audit rows", async () => {
    const w = await menuService.upsertWeek({ weekStart: "2099-02-02", orderCutoff: "2099-02-01T18:00:00Z" });
    const rows = await db.select().from(auditLog).where(eq(auditLog.entityPublicId, w.publicId));
    expect(rows.some((r) => r.entity === "menu_weeks" && r.operation === "create")).toBe(true);
  });
});
