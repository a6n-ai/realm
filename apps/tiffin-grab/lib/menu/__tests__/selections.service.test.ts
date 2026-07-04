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
    const [nd] = await db.insert(dishes).values({ name: "Chicken", diet: "nonveg", slots: ["lunch"] }).returning();
    vegDishPublicId = vd.publicId;
    nonvegDishPublicId = nd.publicId;
    vegDishBigintId = vd.id;
    await db.insert(menuItems).values({ menuWeekId: w.id, dayOfWeek: "mon", slot: "lunch", dishId: vegDishBigintId, isDefault: true });
  });
  afterAll(reset);

  it("saves a valid pick", async () => {
    await selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "mon", slot: "lunch", personIndex: 1, dishPublicId: vegDishPublicId });
    const [row] = await db.select().from(mealSelections).where(eq(mealSelections.orderId, order.id));
    expect(row.dishId).toBe(vegDishBigintId);
  });
  it("rejects a dish not on that day/slot menu", async () => {
    await expect(selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "mon", slot: "lunch", personIndex: 1, dishPublicId: nonvegDishPublicId }))
      .rejects.toBeInstanceOf(ValidationError);
  });
  it("rejects after cutoff (locked)", async () => {
    // Use a past week so the per-day rolling cutoff has already elapsed.
    const [pastWeek] = await db.insert(menuWeeks).values({ weekStart: "2000-01-03", status: "released", orderCutoff: 1 }).returning();
    await db.insert(menuItems).values({ menuWeekId: pastWeek.id, dayOfWeek: "mon", slot: "lunch", dishId: vegDishBigintId, isDefault: true });
    const pastOrder = { ...order, startDate: "2000-01-03" };
    await expect(selectionsService.setSelection({ order: pastOrder, menuWeek: pastWeek, dayOfWeek: "mon", slot: "lunch", personIndex: 1, dishPublicId: vegDishPublicId }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  describe("paused order: pauseWindow threaded into day-membership check", () => {
    // FUTURE_MONDAY is week 1. Pause all of week 1 (Mon–Fri).
    // With durationWeeks=2 the 10 deliveries extend into week 3 (FUTURE_MONDAY + 14 days).
    // We verify:
    //   - A paused-week date (Mon week 1) is REJECTED.
    //   - An extended-tail date (Mon week 3) is ACCEPTED.
    let pausedOrder: typeof orders.$inferSelect;
    let tailWeek: typeof menuWeeks.$inferSelect;
    let tailWeekStart: string;

    beforeEach(async () => {
      const snap = await loadCatalogSnapshot();
      // Compute paused_from / paused_until (Mon–Fri of week 1).
      const pausedFrom = FUTURE_MONDAY;
      const pausedUntilDate = new Date(`${FUTURE_MONDAY}T00:00:00.000Z`);
      pausedUntilDate.setUTCDate(pausedUntilDate.getUTCDate() + 4); // Friday
      const pausedUntil = pausedUntilDate.toISOString().slice(0, 10);

      // Week 3 start = FUTURE_MONDAY + 14 days.
      const tailDate = new Date(`${FUTURE_MONDAY}T00:00:00.000Z`);
      tailDate.setUTCDate(tailDate.getUTCDate() + 14);
      tailWeekStart = tailDate.toISOString().slice(0, 10);

      const [u] = await db.insert(users).values({ phone: "+16475558000", role: "user" }).returning();
      const [o] = await db.insert(orders).values({
        userId: u.id, planId: snap.plans.find((p) => p.key === "veg")!.id, mealSizeId: snap.mealSizes[0].id,
        frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id, persons: 1, mealSlots: ["lunch"],
        durationWeeks: 2, startDate: FUTURE_MONDAY, tiffinCount: 10, perTiffinPrice: "10.00",
        pricingSnapshot: {}, total: "100.00", status: "active",
        pausedFrom, pausedUntil,
        deploymentId: "SUB-TEST02", fullName: "T", addressLine: "1", city: "Toronto", postalCode: "M5V 2T6",
      }).returning();
      pausedOrder = o;

      const [tw] = await db.insert(menuWeeks).values({ weekStart: tailWeekStart, status: "released", orderCutoff: new Date("2999-01-01").getTime() }).returning();
      tailWeek = tw;
      await db.insert(menuItems).values({ menuWeekId: tw.id, dayOfWeek: "mon", slot: "lunch", dishId: vegDishBigintId, isDefault: true });
    });

    it("rejects a paused-week date (week 1 Mon is inside pauseWindow)", async () => {
      await expect(
        selectionsService.setSelection({ order: pausedOrder, menuWeek: week, dayOfWeek: "mon", slot: "lunch", personIndex: 1, dishPublicId: vegDishPublicId }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("accepts an extended-tail date (week 3 Mon pushed out by pause)", async () => {
      await selectionsService.setSelection({ order: pausedOrder, menuWeek: tailWeek, dayOfWeek: "mon", slot: "lunch", personIndex: 1, dishPublicId: vegDishPublicId });
      const [row] = await db.select().from(mealSelections).where(eq(mealSelections.orderId, pausedOrder.id));
      expect(row.dishId).toBe(vegDishBigintId);
    });
  });
});
