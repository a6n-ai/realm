import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, dishes, menuItems, menuWeeks, orders, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { myDeliveryMeal } = await import("../customer-deliveries.service");

// Two distinct future Mondays so the released-week case and the unreleased-week
// case never collide on the menu_weeks (planType, weekStart) unique index.
const FUTURE_MONDAY = (() => {
  const d = new Date(Date.now() + 56 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
})();
const OTHER_MONDAY = (() => {
  const d = new Date(new Date(`${FUTURE_MONDAY}T00:00:00Z`).getTime() + 7 * 86400000);
  return d.toISOString().slice(0, 10);
})();

async function reset() {
  await db.delete(menuItems);
  await db.delete(menuWeeks);
  await db.delete(deliveries);
  await db.delete(orders);
  await db.delete(dishes);
  await db.delete(users).where(ne(users.isSystem, true));
}

describe("myDeliveryMeal (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("resolves the delivered categories for a released week", async () => {
    const snap = await loadCatalogSnapshot();
    const plan = snap.plans.find((p) => p.key === "veg")!;
    const [u] = await db.insert(users).values({ phone: "+16475559100", role: "user" }).returning();
    const [order] = await db.insert(orders).values({
      userId: u.id, planId: plan.id, mealSizeId: snap.mealSizes[0].id,
      frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id, persons: 1, mealSlots: ["lunch"],
      durationWeeks: 1, startDate: FUTURE_MONDAY, tiffinCount: 5, perTiffinPrice: "10.00", pricingSnapshot: {}, total: "50.00", status: "active",
      deploymentId: "SUB-TEST04", fullName: "T", addressLine: "1", city: "Toronto", postalCode: "M5V 2T6",
    }).returning();
    const [delivery] = await db.insert(deliveries).values({
      orderId: order.id, deliveryDate: FUTURE_MONDAY, cutoffAt: new Date("2999-01-01").getTime(),
    }).returning();

    const [week] = await db.insert(menuWeeks).values({
      planType: plan.planType, weekStart: FUTURE_MONDAY, status: "released", orderCutoff: new Date("2999-01-01").getTime(),
    }).returning();
    const [sabziDefault] = await db.insert(dishes).values({ name: "Paneer", diet: "veg" }).returning();
    await db.insert(menuItems).values({ menuWeekId: week.id, dayOfWeek: "mon", slot: "sabzi", dishId: sabziDefault.id, isDefault: true });

    const meal = await myDeliveryMeal({ ...delivery, orderPublicId: order.publicId, planName: plan.name, isMakeup: false });

    expect(Array.isArray(meal)).toBe(true);
    expect((meal as { category: string }[]).some((c) => c.category === "sabzi")).toBe(true);
  });

  it("returns { pending } when the week is not released", async () => {
    const snap = await loadCatalogSnapshot();
    const plan = snap.plans.find((p) => p.key === "veg")!;
    const [u] = await db.insert(users).values({ phone: "+16475559101", role: "user" }).returning();
    const [order] = await db.insert(orders).values({
      userId: u.id, planId: plan.id, mealSizeId: snap.mealSizes[0].id,
      frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id, persons: 1, mealSlots: ["lunch"],
      durationWeeks: 1, startDate: OTHER_MONDAY, tiffinCount: 5, perTiffinPrice: "10.00", pricingSnapshot: {}, total: "50.00", status: "active",
      deploymentId: "SUB-TEST05", fullName: "T", addressLine: "1", city: "Toronto", postalCode: "M5V 2T6",
    }).returning();
    const [delivery] = await db.insert(deliveries).values({
      orderId: order.id, deliveryDate: OTHER_MONDAY, cutoffAt: new Date("2999-01-01").getTime(),
    }).returning();

    // draft (not released) week for this plan/week — myDeliveryMeal must not see it
    await db.insert(menuWeeks).values({
      planType: plan.planType, weekStart: OTHER_MONDAY, status: "draft", orderCutoff: new Date("2999-01-01").getTime(),
    }).returning();

    const meal = await myDeliveryMeal({ ...delivery, orderPublicId: order.publicId, planName: plan.name, isMakeup: false });

    expect(meal).toEqual({ pending: true });
  });
});
