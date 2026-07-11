import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSelections, menuItems, menuWeeks, orders, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { resolveDeliveryMeal } = await import("../resolve-delivery-meal");

const FUTURE_MONDAY = (() => {
  const d = new Date(Date.now() + 56 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
})();

let order: typeof orders.$inferSelect;
let week: typeof menuWeeks.$inferSelect;
let pickedSabziPublicId: string;

async function reset() {
  await db.delete(mealSelections); await db.delete(menuItems); await db.delete(menuWeeks);
  await db.delete(orders); await db.delete(dishes); await db.delete(users).where(ne(users.isSystem, true));
}

describe("resolveDeliveryMeal", () => {
  beforeEach(async () => {
    await reset();
    const snap = await loadCatalogSnapshot();
    const [u] = await db.insert(users).values({ phone: "+16475559000", role: "user" }).returning();
    const [o] = await db.insert(orders).values({
      userId: u.id, planId: snap.plans.find((p) => p.key === "veg")!.id, mealSizeId: snap.mealSizes[0].id,
      frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id, persons: 1, mealSlots: ["lunch"],
      durationWeeks: 1, startDate: FUTURE_MONDAY, tiffinCount: 5, perTiffinPrice: "10.00", pricingSnapshot: {}, total: "50.00", status: "active",
      deploymentId: "SUB-TEST03", fullName: "T", addressLine: "1", city: "Toronto", postalCode: "M5V 2T6",
    }).returning();
    order = o;
    const [w] = await db.insert(menuWeeks).values({ weekStart: FUTURE_MONDAY, status: "released", orderCutoff: new Date("2999-01-01").getTime() }).returning();
    week = w;

    // sabzi is the seeded selectable category (veg plan's category_counts has sabzi:2)
    const [sabziDefault] = await db.insert(dishes).values({ name: "Paneer", diet: "veg" }).returning();
    const [sabziPicked] = await db.insert(dishes).values({ name: "Bhindi", diet: "veg" }).returning();
    // rice is the seeded fixed category (selectable=false)
    const [riceDefault] = await db.insert(dishes).values({ name: "Basmati", diet: "veg" }).returning();

    await db.insert(menuItems).values({ menuWeekId: w.id, dayOfWeek: "mon", slot: "sabzi", dishId: sabziDefault.id, isDefault: true });
    await db.insert(menuItems).values({ menuWeekId: w.id, dayOfWeek: "mon", slot: "sabzi", dishId: sabziPicked.id, isDefault: false });
    await db.insert(menuItems).values({ menuWeekId: w.id, dayOfWeek: "mon", slot: "rice", dishId: riceDefault.id, isDefault: true });

    pickedSabziPublicId = sabziPicked.publicId;

    // Explicit pick for sabzi pickIndex 1; pickIndex 2 has no explicit pick, so falls back to isDefault.
    await db.insert(mealSelections).values({
      orderId: order.id, menuWeekId: week.id, dayOfWeek: "mon", slot: "sabzi", personIndex: 1, pickIndex: 1, dishId: sabziPicked.id,
    });
  });
  afterAll(reset);

  it("resolves selectable categories with per-pick picks/defaults and fixed categories as a single read-only quantity", async () => {
    const meal = await resolveDeliveryMeal(order, week, "mon", 1);

    const sabzi = meal.find((m) => m.category === "sabzi")!;
    expect(sabzi.selectable).toBe(true);
    expect(sabzi.quantity).toBe(2); // count from plan
    expect(sabzi.picks[0].dishPublicId).toBe(pickedSabziPublicId); // explicit pick
    expect(sabzi.picks[1].name).toBeDefined(); // pickIndex 2 falls back to isDefault

    const rice = meal.find((m) => m.category === "rice")!;
    expect(rice.selectable).toBe(false);
    expect(rice.quantity).toBe(1);
    expect(rice.picks.length).toBe(1); // the single default dish
  });

  it("falls back to the lowest-position item (deterministic) when no item is marked isDefault", async () => {
    // tue has no explicit isDefault in the sabzi category and no explicit picks —
    // both dishes are isDefault=false with distinct positions.
    const [sabziLow] = await db.insert(dishes).values({ name: "Aloo Gobi", diet: "veg" }).returning();
    const [sabziHigh] = await db.insert(dishes).values({ name: "Chana Masala", diet: "veg" }).returning();
    await db.insert(menuItems).values({ menuWeekId: week.id, dayOfWeek: "tue", slot: "sabzi", dishId: sabziLow.id, isDefault: false, position: 1 });
    await db.insert(menuItems).values({ menuWeekId: week.id, dayOfWeek: "tue", slot: "sabzi", dishId: sabziHigh.id, isDefault: false, position: 2 });

    const meal = await resolveDeliveryMeal(order, week, "tue", 1);

    const sabzi = meal.find((m) => m.category === "sabzi")!;
    expect(sabzi.selectable).toBe(true);
    // No isDefault and no explicit picks for either pickIndex: both picks resolve to the
    // lowest-position item, deterministically (not an arbitrary/nondeterministic row).
    expect(sabzi.picks[0].dishPublicId).toBe(sabziLow.publicId);
    expect(sabzi.picks[0].name).toBe("Aloo Gobi");
    expect(sabzi.picks[1].dishPublicId).toBe(sabziLow.publicId);
  });
});
