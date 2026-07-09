import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { auditLog, dishes, dishCategories, menuItems, menuWeeks } = await import("@/db/schema");
const { menuService } = await import("../menu.service");

async function reset() {
  await db.delete(auditLog);
  await db.delete(menuItems);
  await db.delete(menuWeeks);
  await db.delete(dishes);
  await db.delete(dishCategories);
  await db.insert(dishCategories).values({ planType: "tiffin", key: "sabzi", label: "Sabzi", enabled: true, selectable: true, sortOrder: 1 });
}

describe("menuService (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("upsertWeek is scoped by plan_type", async () => {
    const a = await menuService.upsertWeek({ planType: "tiffin", weekStart: "2099-01-05" });
    const b = await menuService.upsertWeek({ planType: "healthy", weekStart: "2099-01-05" });
    expect(a.publicId).not.toBe(b.publicId); // same week, different type => distinct rows
    const again = await menuService.upsertWeek({ planType: "tiffin", weekStart: "2099-01-05" });
    expect(again.publicId).toBe(a.publicId);
  });

  it("addItem validates slot against the plan type's slots", async () => {
    const [d] = await db.insert(dishes).values({ name: "Paneer", diet: "veg", slots: [] }).returning();
    const w = await menuService.upsertWeek({ planType: "tiffin", weekStart: "2099-01-12" });
    await expect(menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "dinner", dishId: d.publicId, position: 0 })).rejects.toThrow();
    const ok = await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "sabzi", dishId: d.publicId, position: 0 });
    expect(ok).toBeTruthy();
  });

  it("reorderItems writes position; getPublishedWeek returns released items ordered", async () => {
    const [d1] = await db.insert(dishes).values({ name: "Paneer", diet: "veg", slots: [] }).returning();
    const [d2] = await db.insert(dishes).values({ name: "Dal", diet: "veg", slots: [] }).returning();
    const w = await menuService.upsertWeek({ planType: "tiffin", weekStart: "2099-01-19" });
    const i1 = await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "sabzi", dishId: d1.publicId, position: 0 });
    const i2 = await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "sabzi", dishId: d2.publicId, position: 1 });
    await menuService.reorderItems({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "sabzi", orderedItemIds: [i2!.publicId, i1!.publicId] });

    expect(await menuService.getPublishedWeek("tiffin")).toBeNull();
    await menuService.release(w.publicId);
    const pub = await menuService.getPublishedWeek("tiffin");
    expect(pub!.weekStart).toBe("2099-01-19");
    expect(pub!.slots.map((s) => s.key)).toEqual(["sabzi"]);
    const mon = pub!.items.filter((x) => x.dayOfWeek === "mon").sort((a, b) => a.position - b.position);
    expect(mon.map((x) => x.dishName)).toEqual(["Dal", "Paneer"]);
  });

  it("listWeeks returns the plan's weeks newest-first with item counts", async () => {
    const [d] = await db.insert(dishes).values({ name: "Paneer", diet: "veg", slots: [] }).returning();
    const older = await menuService.upsertWeek({ planType: "tiffin", weekStart: "2099-03-02" });
    const newer = await menuService.upsertWeek({ planType: "tiffin", weekStart: "2099-03-09" });
    await menuService.upsertWeek({ planType: "healthy", weekStart: "2099-03-09" });
    await menuService.addItem({ menuWeekId: newer.publicId, dayOfWeek: "mon", slot: "sabzi", dishId: d.publicId, position: 0 });

    const weeks = await menuService.listWeeks("tiffin");
    expect(weeks.map((w) => w.weekStart)).toEqual(["2099-03-09", "2099-03-02"]); // newest first, healthy excluded
    expect(weeks.find((w) => w.publicId === newer.publicId)!.itemCount).toBe(1);
    expect(weeks.find((w) => w.publicId === older.publicId)!.itemCount).toBe(0);
  });

  it("listWeekMenus returns each week's items + slots for the plan", async () => {
    const [d] = await db.insert(dishes).values({ name: "Paneer", diet: "veg", slots: [] }).returning();
    const w = await menuService.upsertWeek({ planType: "tiffin", weekStart: "2099-04-06" });
    await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "sabzi", dishId: d.publicId, position: 0 });

    const menus = await menuService.listWeekMenus("tiffin");
    const wk = menus.find((m) => m.publicId === w.publicId)!;
    expect(wk.slots.map((s) => s.key)).toEqual(["sabzi"]);
    expect(wk.items).toHaveLength(1);
    expect(wk.items[0]).toMatchObject({ dayOfWeek: "mon", slot: "sabzi", dishName: "Paneer", diet: "veg" });
  });
});
