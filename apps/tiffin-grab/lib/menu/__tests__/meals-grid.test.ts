// Regression coverage for the FINDING 1 / FINDING 2 fixes: buildMealsGrid must call
// resolveDeliveryMeal for its resolved/selected dish rather than re-deriving default
// selection, stale-pick fallback, or diet filtering itself. Every test here asserts BOTH
// buildMealsGrid and resolveDeliveryMeal AGREE — that agreement is the invariant under test.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, deliveryFrequencies, dishes, mealSelections, menuItems, menuWeeks, orders, plans, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { thisWeekStartIso } from "@/lib/menu/delivery-dates";
import type { GridCell } from "../meals-grid";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { resolveDeliveryMeal } = await import("../resolve-delivery-meal");
const { buildMealsGrid } = await import("../meals-grid");
const { skipDelivery, pauseRange } = await import("@/lib/services/deliveries.service");

const SETTINGS = { timezone: "UTC", cutoffHour: 23 };
const THIS_MONDAY = thisWeekStartIso(Date.now(), SETTINGS.timezone);

async function reset() {
  await db.delete(mealSelections); await db.delete(menuItems); await db.delete(menuWeeks); await db.delete(deliveries);
  await db.delete(orders); await db.delete(dishes); await db.delete(users).where(ne(users.isSystem, true));
  await db.delete(plans).where(like(plans.key, "veg_no_sabzi_%"));
}

// A scheduled delivery row for THIS_MONDAY, far from its cutoff — the grid's read path only
// shows dates with a visible ('scheduled') row, so every grid test needs one materialized here
// (order alone no longer implies a schedule).
async function seedMondayDelivery(orderId: bigint, overrides: Partial<typeof deliveries.$inferInsert> = {}) {
  const [row] = await db.insert(deliveries).values({
    orderId, deliveryDate: THIS_MONDAY, status: "scheduled", cutoffAt: Date.now() + 1e9, ...overrides,
  }).returning();
  return row;
}

async function makeOrder(planId: bigint, overrides: Partial<typeof orders.$inferInsert> = {}) {
  const snap = await loadCatalogSnapshot();
  const [u] = await db.insert(users).values({ phone: `+1647555${Math.floor(Math.random() * 9000 + 1000)}`, role: "user" }).returning();
  const [freq] = await db.select().from(deliveryFrequencies).where(eq(deliveryFrequencies.key, "5_day")).limit(1);
  const [o] = await db.insert(orders).values({
    userId: u.id, planId, mealSizeId: snap.mealSizes[0].id, frequencyId: freq.id,
    persons: 1, mealSlots: ["lunch"], durationWeeks: 1, startDate: THIS_MONDAY,
    // Counts now live on the order snapshot, not the plan — default to the veg shape.
    categoryCounts: { sabzi: 2, rice: 1 },
    tiffinCount: 5, perTiffinPrice: "10.00", pricingSnapshot: {}, total: "50.00", status: "active",
    deploymentId: `SUB-GRID-${Math.floor(Math.random() * 1e6)}`, fullName: "T", addressLine: "1", city: "Toronto", postalCode: "M5V 2T6",
    ...overrides,
  }).returning();
  const mealOrder = {
    id: o.id, publicId: o.publicId, planId: o.planId, persons: o.persons, categoryCounts: o.categoryCounts, mealSlots: o.mealSlots,
    includeSaturday: o.includeSaturday, includeSunday: o.includeSunday, startDate: o.startDate,
    durationWeeks: o.durationWeeks, frequencyKey: "5_day",
  };
  return { order: o, mealOrder };
}

async function makeWeek() {
  const [w] = await db.insert(menuWeeks).values({ weekStart: THIS_MONDAY, status: "released", orderCutoff: new Date("2999-01-01").getTime() }).returning();
  return w;
}

function cellsFor(grid: GridCell[], day: string, slot: string) {
  return grid.filter((c) => c.day === day && c.slot === slot);
}

describe("buildMealsGrid agrees with resolveDeliveryMeal", () => {
  beforeEach(reset);
  afterAll(reset);

  it("falls back to the day's default when a pick's dish was removed from that day (still present another day)", async () => {
    const snap = await loadCatalogSnapshot();
    const vegPlan = snap.plans.find((p) => p.key === "veg")!;
    const { order, mealOrder } = await makeOrder(vegPlan.id);
    await seedMondayDelivery(order.id);
    const week = await makeWeek();

    const [sabziDefault] = await db.insert(dishes).values({ name: "Paneer", diet: "veg" }).returning();
    const [staleDish] = await db.insert(dishes).values({ name: "Bhindi", diet: "veg" }).returning();

    // mon: only the default is offered (staleDish was removed from mon's menu).
    await db.insert(menuItems).values({ menuWeekId: week.id, dayOfWeek: "mon", slot: "sabzi", dishId: sabziDefault.id, isDefault: true });
    // tue: staleDish is still offered elsewhere in the week.
    await db.insert(menuItems).values({ menuWeekId: week.id, dayOfWeek: "tue", slot: "sabzi", dishId: staleDish.id, isDefault: false });

    // Subscriber's pick for mon references the now-removed dish.
    await db.insert(mealSelections).values({
      orderId: order.id, menuWeekId: week.id, dayOfWeek: "mon", slot: "sabzi", personIndex: 1, pickIndex: 1, dishId: staleDish.id,
    });

    const resolved = await resolveDeliveryMeal(order, week, "mon", 1);
    const resolvedSabzi = resolved.find((r) => r.category === "sabzi")!;
    expect(resolvedSabzi.picks[0].dishPublicId).toBe(sabziDefault.publicId);
    expect(resolvedSabzi.picks[0].isDefaulted).toBe(true);

    const grid = await buildMealsGrid(mealOrder, SETTINGS);
    if (grid.empty !== null) throw new Error(`expected grid, got empty=${grid.empty}`);
    const cell = cellsFor(grid.grid, "mon", "sabzi").find((c) => c.pickIndex === 1)!;

    expect(cell.selectedDishId).toBe(resolvedSabzi.picks[0].dishPublicId);
    expect(cell.isDefaulted).toBe(true);
    expect(cell.selectedDishId).toBe(sabziDefault.publicId);
  });

  it("omits a category whose day items are all outside the plan's diet (veg plan, nonveg-only rice)", async () => {
    const snap = await loadCatalogSnapshot();
    const vegPlan = snap.plans.find((p) => p.key === "veg")!;
    const { order, mealOrder } = await makeOrder(vegPlan.id);
    await seedMondayDelivery(order.id);
    const week = await makeWeek();

    const [sabziDish] = await db.insert(dishes).values({ name: "Paneer", diet: "veg" }).returning();
    await db.insert(menuItems).values({ menuWeekId: week.id, dayOfWeek: "mon", slot: "sabzi", dishId: sabziDish.id, isDefault: true });

    // rice is fixed/non-selectable, but its only mon item is nonveg — outside the veg plan's diet.
    const [riceNonveg] = await db.insert(dishes).values({ name: "Chicken Biryani Rice", diet: "nonveg" }).returning();
    await db.insert(menuItems).values({ menuWeekId: week.id, dayOfWeek: "mon", slot: "rice", dishId: riceNonveg.id, isDefault: true });

    const resolved = await resolveDeliveryMeal(order, week, "mon", 1);
    expect(resolved.find((r) => r.category === "rice")).toBeUndefined();

    const grid = await buildMealsGrid(mealOrder, SETTINGS);
    if (grid.empty !== null) throw new Error(`expected grid, got empty=${grid.empty}`);
    expect(cellsFor(grid.grid, "mon", "rice")).toHaveLength(0);

    // sabzi (correctly veg) is still present in both, to prove the day/week isn't broken wholesale.
    expect(resolved.find((r) => r.category === "sabzi")).toBeDefined();
    expect(cellsFor(grid.grid, "mon", "sabzi").length).toBeGreaterThan(0);
  });

  it("reset() cleans up its own veg_no_sabzi_ junk plans (scoped cleanup, not a blanket wipe)", async () => {
    await db.insert(plans).values({
      key: `veg_no_sabzi_${Math.floor(Math.random() * 1e6)}`, name: "Veg (no sabzi count)", planType: "tiffin",
    });

    await reset();

    const leaked = await db.select().from(plans).where(like(plans.key, "veg_no_sabzi_%"));
    expect(leaked).toHaveLength(0);
  });

  it("emits zero cells/picks for a selectable category the order's category_counts omits", async () => {
    const [vegPlan] = await db.insert(plans).values({
      key: `veg_no_sabzi_${Math.floor(Math.random() * 1e6)}`, name: "Veg (no sabzi count)", planType: "tiffin",
    }).returning();
    // The omission now lives on the order snapshot, not the plan: sabzi intentionally omitted.
    const { order, mealOrder } = await makeOrder(vegPlan.id, { categoryCounts: { rice: 1, roti: 4, raita: 1, salad: 1 } });
    await seedMondayDelivery(order.id);
    const week = await makeWeek();

    const [sabziDish] = await db.insert(dishes).values({ name: "Paneer", diet: "veg" }).returning();
    await db.insert(menuItems).values({ menuWeekId: week.id, dayOfWeek: "mon", slot: "sabzi", dishId: sabziDish.id, isDefault: true });

    const resolved = await resolveDeliveryMeal(order, week, "mon", 1);
    expect(resolved.find((r) => r.category === "sabzi")).toBeUndefined();

    const grid = await buildMealsGrid(mealOrder, SETTINGS);
    if (grid.empty !== null) throw new Error(`expected grid, got empty=${grid.empty}`);
    expect(cellsFor(grid.grid, "mon", "sabzi")).toHaveLength(0);
  });
});

describe("buildMealsGrid reads deliveries rows, not a computed schedule", () => {
  beforeEach(reset);
  afterAll(reset);

  it("a skipped delivery vanishes from the grid", async () => {
    const snap = await loadCatalogSnapshot();
    const vegPlan = snap.plans.find((p) => p.key === "veg")!;
    const { order, mealOrder } = await makeOrder(vegPlan.id);
    const d = await seedMondayDelivery(order.id);
    await makeWeek();

    await skipDelivery(d.publicId, 1n);

    const grid = await buildMealsGrid(mealOrder, SETTINGS);
    if (grid.empty === null) {
      expect(grid.weekDatesView.some((v) => v.dateIso === THIS_MONDAY)).toBe(false);
    } else {
      expect(grid.empty).toBe("no-dates");
    }
  });

  it("a paused delivery vanishes from the grid", async () => {
    const snap = await loadCatalogSnapshot();
    const vegPlan = snap.plans.find((p) => p.key === "veg")!;
    const { order, mealOrder } = await makeOrder(vegPlan.id);
    await seedMondayDelivery(order.id, { orderId: order.id, status: "paused" });
    await makeWeek();

    const grid = await buildMealsGrid(mealOrder, SETTINGS);
    if (grid.empty === null) {
      expect(grid.weekDatesView.some((v) => v.dateIso === THIS_MONDAY)).toBe(false);
    } else {
      expect(grid.empty).toBe("no-dates");
    }
  });

  it("a scheduled make-up delivery appears in the grid (visibleDeliveries has no makeupForDeliveryId filter)", async () => {
    const snap = await loadCatalogSnapshot();
    const vegPlan = snap.plans.find((p) => p.key === "veg")!;
    const { order, mealOrder } = await makeOrder(vegPlan.id);
    const original = await seedMondayDelivery(order.id);
    await makeWeek();

    // A make-up is a real, independently-scheduled delivery — it must show up in the grid just
    // like any other scheduled row, regardless of makeupForDeliveryId.
    const makeupDateIso = (() => {
      const d = new Date(`${THIS_MONDAY}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    })();
    await db.insert(deliveries).values({
      orderId: order.id, deliveryDate: makeupDateIso, status: "scheduled",
      cutoffAt: Date.now() + 1e9, makeupForDeliveryId: original.id,
    });

    const grid = await buildMealsGrid(mealOrder, SETTINGS);
    if (grid.empty !== null) throw new Error(`expected grid, got empty=${grid.empty}`);
    expect(grid.weekDatesView.some((v) => v.dateIso === makeupDateIso)).toBe(true);
  });

  it("the grid's lockMs equals the row's stored cutoffAt", async () => {
    const snap = await loadCatalogSnapshot();
    const vegPlan = snap.plans.find((p) => p.key === "veg")!;
    const { order, mealOrder } = await makeOrder(vegPlan.id);
    const cutoffAt = Date.now() + 12345;
    const d = await seedMondayDelivery(order.id, { cutoffAt });
    await makeWeek();

    const grid = await buildMealsGrid(mealOrder, SETTINGS);
    if (grid.empty !== null) throw new Error(`expected grid, got empty=${grid.empty}`);
    const view = grid.weekDatesView.find((v) => v.dateIso === THIS_MONDAY)!;
    expect(view.lockMs).toBe(d.cutoffAt);
    expect(view.lockMs).toBe(cutoffAt);
  });
});
