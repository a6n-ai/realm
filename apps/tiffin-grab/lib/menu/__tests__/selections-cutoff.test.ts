import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { app, deliveryFrequencies, dishes, mealSelections, menuItems, menuWeeks, orders, plans, users } from "@/db/schema";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { selectionsService } = await import("../selections.service");

let order: typeof orders.$inferSelect;
let week: typeof menuWeeks.$inferSelect;
let dishPublicId: string;

async function reset() {
  await db.delete(mealSelections); await db.delete(menuItems); await db.delete(menuWeeks);
  await db.delete(orders); await db.delete(dishes);
}

describe("setSelection per-day cutoff + span", () => {
  beforeEach(async () => {
    await reset();
    // The seeded `app` singleton is FK-referenced by an admin account row, so it can't be
    // deleted between tests — update it in place instead of delete+insert.
    const [existingApp] = await db.select().from(app).limit(1);
    if (existingApp) {
      await db.update(app).set({ timezone: "America/Toronto", cutoffHour: 18 }).where(eq(app.id, existingApp.id));
    } else {
      await db.insert(app).values({ timezone: "America/Toronto", cutoffHour: 18 });
    }
    const [u] = await db.insert(users).values({ phone: "+15550000001", name: "T", role: "user" }).onConflictDoNothing().returning();
    const userId = u?.id ?? (await db.select().from(users).where(eq(users.phone, "+15550000001")).limit(1))[0].id;
    const [plan] = await db.select().from(plans).where(eq(plans.key, "veg")).limit(1);
    const [freq] = await db.select().from(deliveryFrequencies).where(eq(deliveryFrequencies.key, "5_day")).limit(1);
    const [mealSize] = await db.select().from((await import("@/db/schema")).mealSizes).limit(1);
    // Menu week starting a Monday far in the future so cutoffs are open.
    const [w] = await db.insert(menuWeeks).values({ weekStart: "2099-01-05", status: "released", orderCutoff: 4070000000000 }).returning(); // 2099 Mon
    week = w;
    const [d] = await db.insert(dishes).values({ name: "Dal", diet: "veg", slots: ["lunch"], active: true }).returning();
    dishPublicId = d.publicId;
    await db.insert(menuItems).values({ menuWeekId: w.id, dayOfWeek: "mon", slot: "sabzi", dishId: d.id, isDefault: true });
    const [o] = await db.insert(orders).values({
      userId, planId: plan.id, mealSizeId: mealSize.id, frequencyId: freq.id, persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate: "2099-01-05",
      pricingSnapshot: {}, tiffinCount: 5, perTiffinPrice: "10.00", total: "50.00", status: "active",
      deploymentId: "SUB-cutoff-test", fullName: "T", addressLine: "1", city: "Toronto", postalCode: "M5V",
    }).returning();
    order = o;
  });
  afterAll(reset);

  it("accepts a pick well before the cutoff", async () => {
    await selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "mon", slot: "sabzi", personIndex: 1, dishPublicId });
    const [row] = await db.select().from(mealSelections).where(and(eq(mealSelections.orderId, order.id), eq(mealSelections.dayOfWeek, "mon")));
    expect(row).toBeTruthy();
  });

  it("rejects a day not in the subscription delivery set (Saturday, not a delivery day)", async () => {
    await db.insert(menuItems).values({ menuWeekId: week.id, dayOfWeek: "sat", slot: "sabzi", dishId: (await db.select().from(dishes).limit(1))[0].id });
    await expect(
      selectionsService.setSelection({ order, menuWeek: week, dayOfWeek: "sat", slot: "sabzi", personIndex: 1, dishPublicId }),
    ).rejects.toThrow();
  });

  it("rejects after the cutoff has passed", async () => {
    const [past] = await db.insert(menuWeeks).values({ weekStart: "2000-01-03", status: "released", orderCutoff: 1 }).returning(); // 2000 Mon, long past
    await db.insert(menuItems).values({ menuWeekId: past.id, dayOfWeek: "mon", slot: "sabzi", dishId: (await db.select().from(dishes).limit(1))[0].id, isDefault: true });
    const pastOrder = { ...order, startDate: "2000-01-03" };
    await expect(
      selectionsService.setSelection({ order: pastOrder, menuWeek: past, dayOfWeek: "mon", slot: "sabzi", personIndex: 1, dishPublicId }),
    ).rejects.toThrow();
  });
});
