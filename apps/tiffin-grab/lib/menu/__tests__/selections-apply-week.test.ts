import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, dishes, mealSelections, menuItems, menuWeeks, orders, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { selectionsService } = await import("../selections.service");

// A Monday ~8 weeks out so every weekday cutoff is still in the future.
const FUTURE_MONDAY = (() => {
  const d = new Date(Date.now() + 56 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
})();

let order: typeof orders.$inferSelect;
let week: typeof menuWeeks.$inferSelect;
let vegDishPublicId: string;
let vegDishBigintId: bigint;

async function reset() {
  await db.delete(mealSelections); await db.delete(menuItems); await db.delete(menuWeeks); await db.delete(deliveries);
  await db.delete(orders); await db.delete(dishes); await db.delete(users).where(ne(users.isSystem, true));
}

function dateInWeek(weekStartIso: string, offset: number) {
  const d = new Date(`${weekStartIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

describe("selectionsService.applyToWeek", () => {
  beforeEach(async () => {
    await reset();
    const snap = await loadCatalogSnapshot();
    const [u] = await db.insert(users).values({ phone: "+16475557100", role: "user" }).returning();
    const [o] = await db.insert(orders).values({
      userId: u.id, planId: snap.plans.find((p) => p.key === "veg")!.id, mealSizeId: snap.mealSizes[0].id,
      frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id, persons: 1, mealSlots: ["lunch"],
      categoryCounts: { sabzi: 2, rice: 1, roti: 4, raita: 1, salad: 1 },
      durationWeeks: 1, startDate: FUTURE_MONDAY, tiffinCount: 5, perTiffinPrice: "10.00",
      pricingSnapshot: {}, total: "50.00", status: "active",
      deploymentId: "SUB-APPLY1", fullName: "T", addressLine: "1", city: "Toronto", postalCode: "M5V 2T6",
    }).returning();
    order = o;
    const [w] = await db.insert(menuWeeks).values({ weekStart: FUTURE_MONDAY, status: "released", orderCutoff: new Date("2999-01-01").getTime() }).returning();
    week = w;
    const [vd] = await db.insert(dishes).values({ name: "Paneer", diet: "veg" }).returning();
    vegDishPublicId = vd.publicId; vegDishBigintId = vd.id;
    // Offer the dish Mon–Thu (4 of the 5 weekday deliveries); Friday deliberately has no menu item for it.
    for (const day of ["mon", "tue", "wed", "thu"] as const) {
      await db.insert(menuItems).values({ menuWeekId: w.id, dayOfWeek: day, slot: "sabzi", dishId: vegDishBigintId, isDefault: false });
    }
    // A scheduled delivery row for every weekday (incl. Friday) — Friday must still be "skipped"
    // for missing the dish, not for missing a delivery row.
    await db.insert(deliveries).values([0, 1, 2, 3, 4].map((offset) => ({
      orderId: o.id, deliveryDate: dateInWeek(FUTURE_MONDAY, offset), status: "scheduled" as const, cutoffAt: Date.now() + 1e9,
    })));
  });
  afterAll(reset);

  it("applies to every eligible delivery day and skips days missing the dish", async () => {
    const res = await selectionsService.applyToWeek({ order, menuWeek: week, slot: "sabzi", personIndex: 1, pickIndex: 1, dishPublicId: vegDishPublicId });
    expect(res.applied).toBe(4);
    expect(res.skipped.map((s) => s.dateIso)).toContain(dateInWeek(FUTURE_MONDAY, 4)); // Friday skipped
    const rows = await db.select().from(mealSelections).where(eq(mealSelections.orderId, order.id));
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.dishId === vegDishBigintId)).toBe(true);
  });

  // Regression for FINDING 1: a make-up delivery can land on a tail date outside
  // durationWeeks × deliveryDays. applyToWeek must read `deliveries` rows (like buildMealsGrid
  // does via visibleDeliveries), not recompute the week's dates from the plan's schedule —
  // otherwise the grid shows a selectable make-up cell that applyToWeek silently ignores.
  it("applies to a make-up delivery date outside the original schedule", async () => {
    // Saturday of the same week: not one of the 5 weekday deliveries seeded in beforeEach, and
    // outside durationWeeks × deliveryDays for this "5_day" order — a date subscriptionDeliveryDates
    // would never produce, but a real make-up row can land here.
    const makeupDateIso = dateInWeek(FUTURE_MONDAY, 5);
    const [originalDelivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);
    const [makeupRow] = await db.insert(deliveries).values({
      orderId: order.id, deliveryDate: makeupDateIso, status: "scheduled" as const,
      cutoffAt: Date.now() + 1e9, makeupForDeliveryId: originalDelivery.id,
    }).returning();
    await db.insert(menuItems).values({ menuWeekId: week.id, dayOfWeek: "sat", slot: "sabzi", dishId: vegDishBigintId, isDefault: false });

    const res = await selectionsService.applyToWeek({ order, menuWeek: week, slot: "sabzi", personIndex: 1, pickIndex: 1, dishPublicId: vegDishPublicId });

    expect(res.applied).toBeGreaterThanOrEqual(1);
    const makeupSelection = await db.select().from(mealSelections)
      .where(and(eq(mealSelections.orderId, order.id), eq(mealSelections.dayOfWeek, "sat")));
    expect(makeupSelection).toHaveLength(1);
    expect(makeupSelection[0].dishId).toBe(vegDishBigintId);
    expect(makeupRow.makeupForDeliveryId).toBe(originalDelivery.id); // sanity: row really is a make-up
  });
});
