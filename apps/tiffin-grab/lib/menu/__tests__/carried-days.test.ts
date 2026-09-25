import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, deliveryCategorySwaps, dishes, mealSelections, menuItems, menuWeeks } from "@/db/schema";
import { attachDishToPlans, categoryIdFor, testPlanId } from "@/db/test-helpers";
import { makeTripOrder, resetTrips } from "@/lib/services/__tests__/trip-fixture";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { selectionsService } = await import("../selections.service");
const { carryingTrips } = await import("../trip-lookup");
const { resolveDeliveryMeal } = await import("../resolve-delivery-meal");

const DEPLOY = "SUB-carried-days";
let week: typeof menuWeeks.$inferSelect;
let dishPublicId: string;

describe("carried eating days", () => {
  beforeAll(async () => {
    await resetTrips(DEPLOY, "carried");
    await db.delete(mealSelections); await db.delete(menuItems); await db.delete(menuWeeks);
    [week] = await db.insert(menuWeeks).values({ weekStart: "2030-01-07", status: "released", orderCutoff: 4070000000000 }).returning();
    const [d] = await db.insert(dishes).values({ planId: await testPlanId(), name: "Carried Dal", category: "sabzi", active: true }).returning();
    await attachDishToPlans(d.id);
    dishPublicId = d.publicId;
    for (const day of ["mon", "tue"] as const) {
      await db.insert(menuItems).values({ menuWeekId: week.id, dayOfWeek: day, categoryId: await categoryIdFor("sabzi"), dishId: d.id, isDefault: true });
    }
  });
  beforeEach(() => resetTrips(DEPLOY, "carried"));
  afterAll(async () => {
    await resetTrips(DEPLOY, "carried");
    await db.delete(mealSelections); await db.delete(menuItems); await db.delete(menuWeeks);
    await db.delete(dishes).where(eq(dishes.name, "Carried Dal"));
  });

  it("setSelection accepts Tuesday, carried by Monday's trip", async () => {
    const { order } = await makeTripOrder(DEPLOY, "carried");
    await selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "tue", slot: "sabzi", personIndex: 1, dishPublicId });
    const rows = await db.select().from(mealSelections).where(eq(mealSelections.orderId, order.id));
    expect(rows.map((r) => r.dayOfWeek)).toEqual(["tue"]);
  });

  it("the carrying trip's cutoff locks the carried day", async () => {
    const { order, mon } = await makeTripOrder(DEPLOY, "carried");
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(eq(deliveries.id, mon.id));
    await expect(
      selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "tue", slot: "sabzi", personIndex: 1, dishPublicId }),
    ).rejects.toThrow("locked");
  });

  it("a date no trip covers is rejected", async () => {
    const { order } = await makeTripOrder(DEPLOY, "carried");
    await db.delete(deliveries).where(eq(deliveries.id, (await db.select().from(deliveries).where(eq(deliveries.orderId, order.id))).find((r) => r.deliveryDate === "2030-01-07")!.id));
    await expect(
      selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "tue", slot: "sabzi", personIndex: 1, dishPublicId }),
    ).rejects.toThrow("isn't part of your order");
  });

  it("carryingTrips maps carried dates and skips merged sources", async () => {
    const { order, mon, wed } = await makeTripOrder(DEPLOY, "carried");
    let map = await carryingTrips(order.id, "2030-01-07", "2030-01-13");
    expect(map.get("2030-01-08")?.id).toBe(mon.id);
    expect(map.get("2030-01-10")?.id).toBe(wed.id);
    await db.update(deliveries).set({ status: "skipped", mergedIntoDeliveryId: wed.id }).where(eq(deliveries.id, mon.id));
    map = await carryingTrips(order.id, "2030-01-07", "2030-01-13");
    expect(map.has("2030-01-08")).toBe(false);
  });

  it("resolveDeliveryMeal applies swaps by for_date; NULL = the trip's own date", async () => {
    const { order, mon } = await makeTripOrder(DEPLOY, "carried");
    await db.insert(deliveryCategorySwaps).values({ deliveryId: mon.id, fromCategory: "sabzi", toCategory: "rice", qtyFrom: 1, qtyTo: 1, forDate: "2030-01-08" });
    const o = { id: order.id, planId: order.planId, mealSizeId: order.mealSizeId, categoryCounts: order.categoryCounts };
    const w = { id: week.id, weekStart: week.weekStart };
    const own = await resolveDeliveryMeal(o, w, "mon", 1, mon.id);
    const carried = await resolveDeliveryMeal(o, w, "tue", 1, mon.id, { forDate: "2030-01-08" });
    expect(own.find((c) => c.category === "sabzi")?.quantity).toBe(1);
    expect(carried.find((c) => c.category === "sabzi")).toBeUndefined();
  });
});
