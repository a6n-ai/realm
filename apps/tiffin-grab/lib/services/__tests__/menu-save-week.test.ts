// saveWeek replaces the per-click addItem/removeItem/reorderItems round trips with one
// diffing transaction. The invariants those clicks enforced individually now have to hold
// for a whole list at once, so they are asserted here rather than assumed.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { categoryIdFor } from "@/db/test-helpers";
import { dishCategories, dishes, mealSelections, menuItems, menuWeeks, orders, users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { menuService } = await import("../menu.service");

async function reset() {
  await db.delete(mealSelections); await db.delete(menuItems); await db.delete(menuWeeks);
  await db.delete(orders); await db.delete(dishes); await db.delete(users).where(ne(users.isSystem, true));
}

let weekId: string;
let updatedAt: number;
let paneer: string;
let bhindi: string;
let basmati: string;

async function draftWeek(weekStart: string) {
  const w = await menuService.upsertWeek({ weekStart });
  return { id: w.publicId, updatedAt: w.updatedAt };
}

/** Read back positions for one (day, category) group, in stored order. */
async function positions(day: "mon" | "tue", categoryKey: string) {
  const rows = await db.select({ position: menuItems.position, name: dishes.name })
    .from(menuItems)
    .innerJoin(dishes, eq(menuItems.dishId, dishes.id))
    .innerJoin(dishCategories, eq(dishCategories.id, menuItems.categoryId))
    .where(and(eq(menuItems.dayOfWeek, day), eq(dishCategories.key, categoryKey)))
    .orderBy(asc(menuItems.position));
  return rows.map((r) => `${r.name}@${r.position}`);
}

describe("menuService.saveWeek", () => {
  beforeEach(async () => {
    await reset();
    const [a] = await db.insert(dishes).values({ name: "Paneer", category: "sabzi" }).returning();
    const [b] = await db.insert(dishes).values({ name: "Bhindi", category: "sabzi" }).returning();
    const [c] = await db.insert(dishes).values({ name: "Basmati", category: "rice" }).returning();
    paneer = a.publicId; bhindi = b.publicId; basmati = c.publicId;
    const w = await draftWeek("2099-06-01");
    weekId = w.id; updatedAt = w.updatedAt;
  });
  afterAll(reset);

  const item = (dishId: string, slot = "sabzi", dayOfWeek: "mon" | "tue" = "mon", isDefault = false) =>
    ({ id: null, dayOfWeek, slot, dishId, isDefault });

  it("assigns position from array order within each day+category group", async () => {
    const first = await menuService.saveWeek({
      menuWeekId: weekId, expectedUpdatedAt: updatedAt,
      items: [item(paneer), item(bhindi), item(basmati, "rice")],
    });
    expect(await positions("mon", "sabzi")).toEqual(["Paneer@0", "Bhindi@1"]);
    // rice numbers from 0 independently — position is per group, not per day.
    expect(await positions("mon", "rice")).toEqual(["Basmati@0"]);

    // Reordering the array reorders storage — position is never sent by the client.
    const reordered = first.items
      .filter((i) => i.slot === "sabzi")
      .reverse()
      .concat(first.items.filter((i) => i.slot !== "sabzi"));
    await menuService.saveWeek({ menuWeekId: weekId, expectedUpdatedAt: first.updatedAt, items: reordered });
    expect(await positions("mon", "sabzi")).toEqual(["Bhindi@0", "Paneer@1"]);
  });

  it("is idempotent — saving the same list twice changes nothing", async () => {
    const first = await menuService.saveWeek({
      menuWeekId: weekId, expectedUpdatedAt: updatedAt, items: [item(paneer), item(bhindi)],
    });
    const second = await menuService.saveWeek({
      menuWeekId: weekId, expectedUpdatedAt: first.updatedAt, items: first.items,
    });
    expect(second.items.map((i) => i.id).sort()).toEqual(first.items.map((i) => i.id).sort());
    expect(await db.select().from(menuItems)).toHaveLength(2);
  });

  it("deletes rows the client dropped, and keeps the ids of rows it kept", async () => {
    const first = await menuService.saveWeek({
      menuWeekId: weekId, expectedUpdatedAt: updatedAt, items: [item(paneer), item(bhindi)],
    });
    const keep = first.items.find((i) => i.dishId === paneer)!;
    const second = await menuService.saveWeek({
      menuWeekId: weekId, expectedUpdatedAt: first.updatedAt, items: [keep],
    });
    expect(second.items).toHaveLength(1);
    expect(second.items[0].id).toBe(keep.id);
    expect(await db.select().from(menuItems)).toHaveLength(1);
  });

  it("rejects a save whose expectedUpdatedAt is stale, and leaves the stored week alone", async () => {
    const first = await menuService.saveWeek({
      menuWeekId: weekId, expectedUpdatedAt: updatedAt, items: [item(paneer)],
    });
    await expect(menuService.saveWeek({
      menuWeekId: weekId, expectedUpdatedAt: updatedAt, items: [item(bhindi)],
    })).rejects.toThrow(/another tab/i);
    const rows = await db.select().from(menuItems);
    expect(rows).toHaveLength(1);
    expect(rows[0].publicId).toBe(first.items[0].id);
  });

  it("rejects two defaults in the same day and category", async () => {
    await expect(menuService.saveWeek({
      menuWeekId: weekId, expectedUpdatedAt: updatedAt,
      items: [item(paneer, "sabzi", "mon", true), item(bhindi, "sabzi", "mon", true)],
    })).rejects.toThrow(/one dish can be the default/i);
    expect(await db.select().from(menuItems)).toHaveLength(0);
  });

  it("rejects a dish placed outside its own category, and writes nothing", async () => {
    await expect(menuService.saveWeek({
      menuWeekId: weekId, expectedUpdatedAt: updatedAt,
      items: [item(paneer), item(basmati, "sabzi")],
    })).rejects.toThrow(/category does not match/i);
    expect(await db.select().from(menuItems)).toHaveLength(0);
  });

  it("rejects the same dish twice in one day and category", async () => {
    await expect(menuService.saveWeek({
      menuWeekId: weekId, expectedUpdatedAt: updatedAt, items: [item(paneer), item(paneer)],
    })).rejects.toThrow(/twice/i);
  });

  it("rejects any save on a released week", async () => {
    await menuService.release(weekId);
    const [w] = await db.select().from(menuWeeks).where(eq(menuWeeks.publicId, weekId));
    await expect(menuService.saveWeek({
      menuWeekId: weekId, expectedUpdatedAt: w.updatedAt, items: [item(paneer)],
    })).rejects.toThrow(/released/i);
  });
});

describe("menuService.copyWeek", () => {
  beforeEach(async () => {
    await reset();
    const [a] = await db.insert(dishes).values({ name: "Paneer", category: "sabzi" }).returning();
    paneer = a.publicId;
  });
  afterAll(reset);

  it("copies a week's dishes into a draft, replacing whatever was there", async () => {
    const source = await draftWeek("2099-07-06");
    await menuService.saveWeek({
      menuWeekId: source.id, expectedUpdatedAt: source.updatedAt,
      items: [{ id: null, dayOfWeek: "mon", slot: "sabzi", dishId: paneer, isDefault: true }],
    });
    const target = await draftWeek("2099-07-13");

    const { copied } = await menuService.copyWeek({ fromWeekId: source.id, toWeekId: target.id });
    expect(copied).toBe(1);

    const { items } = await menuService.weekWithItems(target.id);
    expect(items).toHaveLength(1);
    expect(items[0].dayOfWeek).toBe("mon");
    expect(items[0].isDefault).toBe(true);
  });

  it("refuses to copy into a released week", async () => {
    const source = await draftWeek("2099-08-03");
    await menuService.saveWeek({
      menuWeekId: source.id, expectedUpdatedAt: source.updatedAt,
      items: [{ id: null, dayOfWeek: "mon", slot: "sabzi", dishId: paneer, isDefault: false }],
    });
    const target = await draftWeek("2099-08-10");
    await menuService.release(target.id);
    await expect(menuService.copyWeek({ fromWeekId: source.id, toWeekId: target.id })).rejects.toThrow(/released/i);
  });
});
