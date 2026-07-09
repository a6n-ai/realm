import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSelections, menuItems, menuWeeks, orders, users } from "@/db/schema";
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
  await db.delete(mealSelections); await db.delete(menuItems); await db.delete(menuWeeks);
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
      durationWeeks: 1, startDate: FUTURE_MONDAY, tiffinCount: 5, perTiffinPrice: "10.00",
      pricingSnapshot: {}, total: "50.00", status: "active",
      deploymentId: "SUB-APPLY1", fullName: "T", addressLine: "1", city: "Toronto", postalCode: "M5V 2T6",
    }).returning();
    order = o;
    const [w] = await db.insert(menuWeeks).values({ weekStart: FUTURE_MONDAY, status: "released", orderCutoff: new Date("2999-01-01").getTime() }).returning();
    week = w;
    const [vd] = await db.insert(dishes).values({ name: "Paneer", diet: "veg", slots: ["lunch"] }).returning();
    vegDishPublicId = vd.publicId; vegDishBigintId = vd.id;
    // Offer the dish Mon–Thu (4 of the 5 weekday deliveries); Friday deliberately has no menu item for it.
    for (const day of ["mon", "tue", "wed", "thu"] as const) {
      await db.insert(menuItems).values({ menuWeekId: w.id, dayOfWeek: day, slot: "sabzi", dishId: vegDishBigintId, isDefault: false });
    }
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
});
