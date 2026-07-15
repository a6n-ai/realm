import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, deliveryFrequencies, dishes, menuItems, menuWeeks, orders, plans, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { comingWeekStartIso } from "@/lib/menu/delivery-dates";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { buildMealsGrid } = await import("../meals-grid");

const SETTINGS = { timezone: "UTC", cutoffHour: 23 };
const COMING_MONDAY = comingWeekStartIso(Date.now(), SETTINGS.timezone);

const IMG = { url: "/api/files/x.jpg", filePath: "x.jpg", fileName: "x.jpg", name: "x.jpg", type: "image/jpeg", isDirectory: false, size: 1 };

async function reset() {
  await db.delete(menuItems); await db.delete(menuWeeks); await db.delete(deliveries);
  await db.delete(orders); await db.delete(dishes); await db.delete(users).where(ne(users.isSystem, true));
  await db.delete(plans).where(like(plans.key, "veg_no_sabzi_%"));
}

async function seedMondayDelivery(orderId: bigint) {
  const [row] = await db.insert(deliveries).values({
    orderId, deliveryDate: COMING_MONDAY, status: "scheduled", cutoffAt: Date.now() + 1e9,
  }).returning();
  return row;
}

async function makeOrder(planId: bigint) {
  const snap = await loadCatalogSnapshot();
  const [u] = await db.insert(users).values({ phone: `+1647555${Math.floor(Math.random() * 9000 + 1000)}`, role: "user" }).returning();
  const [freq] = await db.select().from(deliveryFrequencies).where(eq(deliveryFrequencies.key, "5_day")).limit(1);
  const [o] = await db.insert(orders).values({
    userId: u.id, planId, mealSizeId: snap.mealSizes[0].id, frequencyId: freq.id,
    persons: 1, mealSlots: ["lunch"], durationWeeks: 1, startDate: COMING_MONDAY,
    categoryCounts: { sabzi: 2, rice: 1 },
    tiffinCount: 5, perTiffinPrice: "10.00", pricingSnapshot: {}, total: "50.00", status: "active",
    deploymentId: `SUB-GRID-IMG-${Math.floor(Math.random() * 1e6)}`, fullName: "T", addressLine: "1", city: "Toronto", postalCode: "M5V 2T6",
  }).returning();
  const mealOrder = {
    id: o.id, publicId: o.publicId, planId: o.planId, persons: o.persons, categoryCounts: o.categoryCounts, mealSlots: o.mealSlots,
    includeSaturday: o.includeSaturday, includeSunday: o.includeSunday, startDate: o.startDate,
    durationWeeks: o.durationWeeks, frequencyKey: "5_day",
  };
  return { order: o, mealOrder };
}

async function makeWeek() {
  const [w] = await db.insert(menuWeeks).values({ weekStart: COMING_MONDAY, status: "released", orderCutoff: new Date("2999-01-01").getTime() }).returning();
  return w;
}

describe("buildMealsGrid — dish image on grid options", () => {
  beforeEach(reset);
  afterAll(reset);

  it("carries the dish image (or null) on every selectable-category option", async () => {
    const snap = await loadCatalogSnapshot();
    const vegPlan = snap.plans.find((p) => p.key === "veg")!;
    const { order, mealOrder } = await makeOrder(vegPlan.id);
    await seedMondayDelivery(order.id);
    const week = await makeWeek();

    const [sabziWithImage] = await db.insert(dishes).values({ name: "Paneer", diet: "veg", image: IMG }).returning();
    await db.insert(menuItems).values({ menuWeekId: week.id, dayOfWeek: "mon", slot: "sabzi", dishId: sabziWithImage.id, isDefault: true });

    const result = await buildMealsGrid(mealOrder, SETTINGS);
    expect(result.empty).toBeNull();
    if (result.empty !== null) throw new Error("unreachable");
    const cellWithOptions = result.grid.find((c) => c.selectable && c.dishes.length > 0);
    expect(cellWithOptions).toBeDefined();
    expect(cellWithOptions!.dishes.every((d) => "image" in d)).toBe(true);
    expect(cellWithOptions!.dishes.some((d) => d.image?.url)).toBe(true);
  });
});
