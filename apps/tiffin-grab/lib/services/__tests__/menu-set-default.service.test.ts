import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, ne } from "drizzle-orm";
import { ValidationError } from "@realm/commons";
import { db } from "@/db/client";
import { dishes, mealSelections, menuItems, menuWeeks, orders, users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { menuService } = await import("../menu.service");

let weekId: bigint;
let itemA: typeof menuItems.$inferSelect;
let itemB: typeof menuItems.$inferSelect;

async function reset() {
  await db.delete(mealSelections); await db.delete(menuItems); await db.delete(menuWeeks);
  await db.delete(orders); await db.delete(dishes); await db.delete(users).where(ne(users.isSystem, true));
}

async function seedDraftCell() {
  const [w] = await db.insert(menuWeeks).values({
    weekStart: "2999-01-04", status: "draft", orderCutoff: new Date("2999-01-01").getTime(),
  }).returning();
  weekId = w.id;
  const [d1] = await db.insert(dishes).values({ name: "Paneer", diet: "veg", slots: ["lunch"] }).returning();
  const [d2] = await db.insert(dishes).values({ name: "Dal", diet: "veg", slots: ["lunch"] }).returning();
  const [a] = await db.insert(menuItems).values({ menuWeekId: w.id, dayOfWeek: "mon", slot: "sabzi", dishId: d1.id, isDefault: false, position: 0 }).returning();
  const [b] = await db.insert(menuItems).values({ menuWeekId: w.id, dayOfWeek: "mon", slot: "sabzi", dishId: d2.id, isDefault: false, position: 1 }).returning();
  itemA = a; itemB = b;
}

async function isDefaultOf(id: bigint): Promise<boolean> {
  const [row] = await db.select({ isDefault: menuItems.isDefault }).from(menuItems).where(eq(menuItems.id, id));
  return row.isDefault;
}

describe("menuService.setDefault", () => {
  beforeEach(async () => { await reset(); await seedDraftCell(); });
  afterAll(reset);

  it("marks one item default", async () => {
    await menuService.setDefault({ itemId: itemA.publicId });
    expect(await isDefaultOf(itemA.id)).toBe(true);
    expect(await isDefaultOf(itemB.id)).toBe(false);
  });

  it("moving default to a sibling unsets the previous one", async () => {
    await menuService.setDefault({ itemId: itemA.publicId });
    await menuService.setDefault({ itemId: itemB.publicId });
    expect(await isDefaultOf(itemA.id)).toBe(false);
    expect(await isDefaultOf(itemB.id)).toBe(true);
  });

  it("setting default on the current default toggles it off", async () => {
    await menuService.setDefault({ itemId: itemA.publicId });
    await menuService.setDefault({ itemId: itemA.publicId });
    expect(await isDefaultOf(itemA.id)).toBe(false);
  });

  it("removing a default leaves the cell with no default", async () => {
    await menuService.setDefault({ itemId: itemA.publicId });
    await menuService.removeItem(itemA.publicId);
    const rows = await db.select().from(menuItems).where(and(eq(menuItems.menuWeekId, weekId), eq(menuItems.isDefault, true)));
    expect(rows).toHaveLength(0);
  });

  it("rejects setting default on a released week", async () => {
    await db.update(menuWeeks).set({ status: "released" }).where(eq(menuWeeks.id, weekId));
    await expect(menuService.setDefault({ itemId: itemA.publicId })).rejects.toBeInstanceOf(ValidationError);
  });
});
