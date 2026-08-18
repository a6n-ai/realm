import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, ne } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { auditLog, dishes, dishCategories, menuItems, menuWeeks, organization } = await import("@/db/schema");
const { attachDishToPlans, attachAllCategoriesToPlans } = await import("@/db/test-helpers");
const { menuService } = await import("../menu.service");

async function reset() {
  await db.delete(auditLog);
  await db.delete(menuItems);
  await db.delete(menuWeeks);
  await db.delete(dishes);
  // Do NOT delete the seeded categories: menu_items.category_id references them, and other
  // suites place dishes in rice/roti/etc. Hide them instead, leave only sabzi enabled, and
  // afterAll switches them all back on.
  await db
    .insert(dishCategories)
    .values({ key: "sabzi", label: "Sabzi", enabled: true, selectable: true, sortOrder: 1 })
    .onConflictDoNothing();
  await db.update(dishCategories).set({ enabled: false }).where(ne(dishCategories.key, "sabzi"));
  await db.update(dishCategories).set({ enabled: true, selectable: true }).where(eq(dishCategories.key, "sabzi"));
  await attachAllCategoriesToPlans();
}

describe("menuService (integration)", () => {
  beforeEach(reset);
  // Restore every seeded category for the suites that run next.
  afterAll(async () => {
    await reset();
    await db.update(dishCategories).set({ enabled: true });
  });

  it("upsertWeek is one row per weekStart — a week serves every plan", async () => {
    const a = await menuService.upsertWeek({ weekStart: "2099-01-05" });
    const again = await menuService.upsertWeek({ weekStart: "2099-01-05" });
    expect(again.publicId).toBe(a.publicId);
    expect(await db.select().from(menuWeeks)).toHaveLength(1);
  });

  it("addItem validates the category against the enabled categories", async () => {
    const [d] = await db.insert(dishes).values({ name: "Paneer"}).returning();
    await attachDishToPlans(d.id);
    const w = await menuService.upsertWeek({ weekStart: "2099-01-12" });
    await expect(menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "dinner", dishId: d.publicId, position: 0 })).rejects.toThrow();
    const ok = await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "sabzi", dishId: d.publicId, position: 0 });
    expect(ok).toBeTruthy();
  });

  it("reorderItems writes position; getPublishedWeek returns released items ordered", async () => {
    const [d1] = await db.insert(dishes).values({ name: "Paneer"}).returning();
    await attachDishToPlans(d1.id);
    const [d2] = await db.insert(dishes).values({ name: "Dal"}).returning();
    await attachDishToPlans(d2.id);
    const w = await menuService.upsertWeek({ weekStart: "2099-01-19" });
    const i1 = await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "sabzi", dishId: d1.publicId, position: 0 });
    const i2 = await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "sabzi", dishId: d2.publicId, position: 1 });
    await menuService.reorderItems({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "sabzi", orderedItemIds: [i2!.publicId, i1!.publicId] });

    expect(await menuService.getPublishedWeek()).toBeNull();
    await menuService.release(w.publicId);
    const pub = await menuService.getPublishedWeek();
    expect(pub!.weekStart).toBe("2099-01-19");
    expect(pub!.slots.map((s) => s.key)).toEqual(["sabzi"]);
    const mon = pub!.items.filter((x) => x.dayOfWeek === "mon").sort((a, b) => a.position - b.position);
    expect(mon.map((x) => x.dishName)).toEqual(["Dal", "Paneer"]);
  });

  it("getReleasedWeek / getReleasedWeeks only return exact released weekStarts", async () => {
    const draft = await menuService.upsertWeek({ weekStart: "2099-05-03" });
    const released = await menuService.upsertWeek({ weekStart: "2099-05-10" });
    await menuService.release(released.publicId);

    expect(await menuService.getReleasedWeek("2099-05-03")).toBeNull(); // draft
    expect(await menuService.getReleasedWeek("2099-05-17")).toBeNull(); // missing
    const one = await menuService.getReleasedWeek("2099-05-10");
    expect(one).toMatchObject({ publicId: released.publicId, weekStart: "2099-05-10" });

    // getPublishedWeek(weekStart) shares the same exact gate
    expect(await menuService.getPublishedWeek("2099-05-03")).toBeNull();
    expect((await menuService.getPublishedWeek("2099-05-10"))?.weekStart).toBe("2099-05-10");

    const batch = await menuService.getReleasedWeeks(["2099-05-03", "2099-05-10", "2099-05-17"]);
    expect(batch.map((w) => w.weekStart)).toEqual(["2099-05-10"]);
    void draft;
  });

  it("getPublishedWeek scopes by organizationId: brand org succeeds, unknown org fails closed", async () => {
    const [d] = await db.insert(dishes).values({ name: "Paneer"}).returning();
    await attachDishToPlans(d.id);
    const w = await menuService.upsertWeek({ weekStart: "2099-06-01" });
    await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "sabzi", dishId: d.publicId, position: 0 });
    await menuService.release(w.publicId);

    // No organizationId — existing unscoped behavior, untouched.
    expect((await menuService.getPublishedWeek("2099-06-01"))?.weekStart).toBe("2099-06-01");

    const [brandOrg] = await db.select({ id: organization.id }).from(organization).limit(1);
    expect(brandOrg).toBeTruthy();
    expect((await menuService.getPublishedWeek("2099-06-01", brandOrg!.id))?.weekStart).toBe("2099-06-01");

    // Resolved org id matches no organization row — fails closed (null), never
    // falls through to the unscoped data above.
    expect(await menuService.getPublishedWeek("2099-06-01", "org_does_not_exist")).toBeNull();
  });

  it("listWeeks returns every week newest-first with item counts", async () => {
    const [d] = await db.insert(dishes).values({ name: "Paneer"}).returning();
    await attachDishToPlans(d.id);
    const older = await menuService.upsertWeek({ weekStart: "2099-03-02" });
    const newer = await menuService.upsertWeek({ weekStart: "2099-03-09" });
    await menuService.addItem({ menuWeekId: newer.publicId, dayOfWeek: "mon", slot: "sabzi", dishId: d.publicId, position: 0 });

    const weeks = await menuService.listWeeks();
    expect(weeks.map((w) => w.weekStart)).toEqual(["2099-03-09", "2099-03-02"]); // newest first
    expect(weeks.find((w) => w.publicId === newer.publicId)!.itemCount).toBe(1);
    expect(weeks.find((w) => w.publicId === older.publicId)!.itemCount).toBe(0);
  });

  it("listWeekMenus returns each week's items + enabled categories", async () => {
    const [d] = await db.insert(dishes).values({ name: "Paneer"}).returning();
    await attachDishToPlans(d.id);
    const w = await menuService.upsertWeek({ weekStart: "2099-04-06" });
    await menuService.addItem({ menuWeekId: w.publicId, dayOfWeek: "mon", slot: "sabzi", dishId: d.publicId, position: 0 });

    const menus = await menuService.listWeekMenus();
    const wk = menus.find((m) => m.publicId === w.publicId)!;
    expect(wk.slots.map((s) => s.key)).toEqual(["sabzi"]);
    expect(wk.items).toHaveLength(1);
    expect(wk.items[0]).toMatchObject({ dayOfWeek: "mon", slot: "sabzi", dishName: "Paneer"});
  });
});
