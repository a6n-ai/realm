import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { ValidationError } from "@realm/commons";
import { db } from "@/db/client";
import { dishes, mealSelections, menuItems, menuWeeks, orders, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { selectionsService } = await import("../selections.service");

const FUTURE_MONDAY = (() => {
  const d = new Date(Date.now() + 56 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
})();

let order: typeof orders.$inferSelect;
let week: typeof menuWeeks.$inferSelect;
let vegDishPublicId: string;
let vegDishPublicId2: string;
let nonvegDishPublicId: string;
let vegDishBigintId: bigint;

async function reset() {
  await db.delete(mealSelections); await db.delete(menuItems); await db.delete(menuWeeks);
  await db.delete(orders); await db.delete(dishes); await db.delete(users).where(ne(users.isSystem, true));
}

describe("selectionsService.setSelection", () => {
  beforeEach(async () => {
    await reset();
    const snap = await loadCatalogSnapshot();
    const [u] = await db.insert(users).values({ phone: "+16475557000", role: "user" }).returning();
    const [o] = await db.insert(orders).values({
      userId: u.id, planId: snap.plans.find((p) => p.key === "veg")!.id, mealSizeId: snap.mealSizes[0].id,
      frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id, persons: 1, mealSlots: ["lunch"],
      durationWeeks: 1, startDate: FUTURE_MONDAY, tiffinCount: 5, perTiffinPrice: "10.00", pricingSnapshot: {}, total: "50.00", status: "active",
      deploymentId: "SUB-TEST01", fullName: "T", addressLine: "1", city: "Toronto", postalCode: "M5V 2T6",
    }).returning();
    order = o;
    const [w] = await db.insert(menuWeeks).values({ weekStart: FUTURE_MONDAY, status: "released", orderCutoff: new Date("2999-01-01").getTime() }).returning();
    week = w;
    const [vd] = await db.insert(dishes).values({ name: "Paneer", diet: "veg", slots: ["lunch"] }).returning();
    const [vd2] = await db.insert(dishes).values({ name: "Bhindi", diet: "veg", slots: ["lunch"] }).returning();
    const [nd] = await db.insert(dishes).values({ name: "Chicken", diet: "nonveg", slots: ["lunch"] }).returning();
    vegDishPublicId = vd.publicId;
    vegDishPublicId2 = vd2.publicId;
    nonvegDishPublicId = nd.publicId;
    vegDishBigintId = vd.id;
    // "sabzi" is the seeded selectable category (veg plan's category_counts has sabzi:2); "rice" is fixed.
    await db.insert(menuItems).values({ menuWeekId: w.id, dayOfWeek: "mon", slot: "sabzi", dishId: vegDishBigintId, isDefault: true });
    await db.insert(menuItems).values({ menuWeekId: w.id, dayOfWeek: "mon", slot: "sabzi", dishId: vd2.id, isDefault: false });
  });
  afterAll(reset);

  it("saves a valid pick", async () => {
    await selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "mon", slot: "sabzi", personIndex: 1, pickIndex: 1, dishPublicId: vegDishPublicId });
    const [row] = await db.select().from(mealSelections).where(eq(mealSelections.orderId, order.id));
    expect(row.dishId).toBe(vegDishBigintId);
  });
  it("rejects a dish not on that day/slot menu", async () => {
    await expect(selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "mon", slot: "sabzi", personIndex: 1, pickIndex: 1, dishPublicId: nonvegDishPublicId }))
      .rejects.toBeInstanceOf(ValidationError);
  });
  it("rejects after cutoff (locked)", async () => {
    // Use a past week so the per-day rolling cutoff has already elapsed.
    const [pastWeek] = await db.insert(menuWeeks).values({ weekStart: "2000-01-03", status: "released", orderCutoff: 1 }).returning();
    await db.insert(menuItems).values({ menuWeekId: pastWeek.id, dayOfWeek: "mon", slot: "sabzi", dishId: vegDishBigintId, isDefault: true });
    const pastOrder = { ...order, startDate: "2000-01-03" };
    await expect(selectionsService.setSelection({ order: pastOrder, menuWeek: pastWeek, dayOfWeek: "mon", slot: "sabzi", personIndex: 1, pickIndex: 1, dishPublicId: vegDishPublicId }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a pick on a fixed (non-selectable) category", async () => {
    // rice is selectable=false
    await db.insert(menuItems).values({ menuWeekId: week.id, dayOfWeek: "mon", slot: "rice", dishId: vegDishBigintId, isDefault: true });
    await expect(selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "mon", slot: "rice", personIndex: 1, pickIndex: 1, dishPublicId: vegDishPublicId }))
      .rejects.toBeInstanceOf(ValidationError);
  });
  it("rejects pickIndex above the plan's category count", async () => {
    await expect(selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "mon", slot: "sabzi", personIndex: 1, pickIndex: 3, dishPublicId: vegDishPublicId }))
      .rejects.toBeInstanceOf(ValidationError);
  });
  it("stores two distinct picks for sabzi count=2", async () => {
    await selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "mon", slot: "sabzi", personIndex: 1, pickIndex: 1, dishPublicId: vegDishPublicId });
    await selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "mon", slot: "sabzi", personIndex: 1, pickIndex: 2, dishPublicId: vegDishPublicId2 });
    const rows = await db.select().from(mealSelections).where(eq(mealSelections.orderId, order.id));
    expect(rows.length).toBe(2);
  });

  // Order-level pausedFrom/pausedUntil is dropped in this task (per-delivery pause lands on the
  // `deliveries` table in a later task) — the former "paused order" describe block tested that
  // column directly and is removed here; Task 8 reintroduces pause-aware day-membership checks
  // against `deliveries`.
});
