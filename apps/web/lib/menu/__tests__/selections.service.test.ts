import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ValidationError } from "@tiffin/commons";
import { db } from "@/db/client";
import { dishes, mealSelections, menuItems, menuWeeks, orders, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { selectionsService } = await import("../selections.service");

let order: typeof orders.$inferSelect; let week: typeof menuWeeks.$inferSelect; let vegDish: string; let nonvegDish: string;

async function reset() {
  await db.delete(mealSelections); await db.delete(menuItems); await db.delete(menuWeeks);
  await db.delete(orders); await db.delete(dishes); await db.delete(users);
}

describe("selectionsService.setSelection", () => {
  beforeEach(async () => {
    await reset();
    const snap = await loadCatalogSnapshot();
    const [u] = await db.insert(users).values({ phone: "+16475557000", role: "user" }).returning();
    const [o] = await db.insert(orders).values({
      userId: u.id, planId: snap.plans.find((p) => p.key === "veg")!.id, mealSizeId: snap.mealSizes[0].id,
      frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id, persons: 1, mealSlots: ["lunch"],
      durationWeeks: 1, pricingSnapshot: {}, weeklyFee: "10.00", total: "10.00", status: "active",
      deploymentId: "SUB-TEST01", fullName: "T", addressLine: "1", city: "Toronto", postalCode: "M5V 2T6",
    }).returning();
    order = o;
    const [w] = await db.insert(menuWeeks).values({ weekStart: "2026-06-22", status: "released", orderCutoff: new Date("2999-01-01") }).returning();
    week = w;
    const [vd] = await db.insert(dishes).values({ name: "Paneer", diet: "veg", slots: ["lunch"] }).returning();
    const [nd] = await db.insert(dishes).values({ name: "Chicken", diet: "nonveg", slots: ["lunch"] }).returning();
    vegDish = vd.id; nonvegDish = nd.id;
    await db.insert(menuItems).values({ menuWeekId: w.id, dayOfWeek: "mon", slot: "lunch", dishId: vegDish, isDefault: true });
  });
  afterAll(reset);

  it("saves a valid pick", async () => {
    await selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "mon", slot: "lunch", personIndex: 1, dishId: vegDish });
    const [row] = await db.select().from(mealSelections).where(eq(mealSelections.orderId, order.id));
    expect(row.dishId).toBe(vegDish);
  });
  it("rejects a dish not on that day/slot menu", async () => {
    await expect(selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "mon", slot: "lunch", personIndex: 1, dishId: nonvegDish }))
      .rejects.toBeInstanceOf(ValidationError);
  });
  it("rejects after cutoff (locked)", async () => {
    const locked = { ...week, orderCutoff: new Date("2000-01-01") };
    await expect(selectionsService.setSelection({ order, menuWeek: locked, dayOfWeek: "mon", slot: "lunch", personIndex: 1, dishId: vegDish }))
      .rejects.toBeInstanceOf(ValidationError);
  });
});
