// A released week is what live orders resolve their meals against. The builder hid the
// edit controls, but nothing server-side enforced it — a stale tab or a direct server-action
// call could rewrite a live menu, and a removed dish then silently resolved to the day's
// default with the subscriber never told. These assert the guard, not the UI.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSelections, menuItems, menuWeeks, orders, users } from "@/db/schema";
import { attachDishToPlans, categoryIdFor } from "@/db/test-helpers";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { menuService } = await import("../menu.service");

const FUTURE_MONDAY = (() => {
  const d = new Date(Date.now() + 56 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
})();

async function reset() {
  await db.delete(mealSelections); await db.delete(menuItems); await db.delete(menuWeeks);
  await db.delete(orders); await db.delete(dishes); await db.delete(users).where(ne(users.isSystem, true));
}

async function seedWeek(status: "draft" | "released") {
  const [week] = await db.insert(menuWeeks).values({
    weekStart: FUTURE_MONDAY, status, orderCutoff: new Date("2999-01-01").getTime(),
  }).returning();
  const [dish] = await db.insert(dishes).values({ name: `Paneer ${Math.random().toString(36).slice(2, 8)}` }).returning();
  await attachDishToPlans(dish.id);
  const [item] = await db.insert(menuItems).values({
    menuWeekId: week.id, dayOfWeek: "mon", categoryId: await categoryIdFor("sabzi"), dishId: dish.id, isDefault: true, position: 0,
  }).returning();
  return { week, dish, item };
}

describe("menuService content edits are draft-only", () => {
  beforeEach(reset);
  afterAll(reset);

  it("rejects addItem on a released week", async () => {
    const { week, dish } = await seedWeek("released");
    await expect(menuService.addItem({
      menuWeekId: week.publicId, dayOfWeek: "tue", slot: "sabzi", dishId: dish.publicId, position: 0,
    })).rejects.toThrow(/released/i);
  });

  it("rejects removeItem on a released week, and the item survives", async () => {
    const { item } = await seedWeek("released");
    await expect(menuService.removeItem(item.publicId)).rejects.toThrow(/released/i);
    const rows = await db.select().from(menuItems);
    expect(rows).toHaveLength(1);
  });

  it("rejects reorderItems on a released week", async () => {
    const { week, item } = await seedWeek("released");
    await expect(menuService.reorderItems({
      menuWeekId: week.publicId, dayOfWeek: "mon", slot: "sabzi", orderedItemIds: [item.publicId],
    })).rejects.toThrow(/released/i);
  });

  it("still allows the same edits on a draft week", async () => {
    const { week, item } = await seedWeek("draft");
    await expect(menuService.reorderItems({
      menuWeekId: week.publicId, dayOfWeek: "mon", slot: "sabzi", orderedItemIds: [item.publicId],
    })).resolves.not.toThrow();
    await menuService.removeItem(item.publicId);
    expect(await db.select().from(menuItems)).toHaveLength(0);
  });
});
