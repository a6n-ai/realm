import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users, customMealPricing, mealSizeItems, mealSizes } = schema;
const { createOrder } = await import("../orders.service");
const svc = await import("../custom-meal.service");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
  await db.delete(customMealPricing);
  // db/seed.sql wipes every meal_size_items row on reseed but keeps custom
  // meal_sizes, so a leftover custom size would come back with no items.
  const customs = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.custom, true));
  for (const c of customs) {
    await db.delete(mealSizeItems).where(eq(mealSizeItems.mealSizeId, c.id));
    await db.delete(mealSizes).where(eq(mealSizes.id, c.id));
  }
}

async function customSize() {
  await svc.upsertPricing({ categoryKey: "sabzi", planKey: "veg", pricePerTu: 4, maxTu: null, active: true }, null);
  return svc.findOrCreateCustomMealSize([{ category: "sabzi", planKey: "veg", tuAmount: 1 }, { category: "sabzi", planKey: "veg", tuAmount: 1 }], { actorId: null });
}

const input = (mealSizeId: string, phone = "+14165550101", email = "cm@example.com") => ({
  planKey: "veg",
  selections: {
    mealSizeId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
    includeSaturday: false, includeSunday: false, durationWeeks: 1,
    startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
  },
  contact: { email, fullName: "C M", phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
});

describe("createOrder with a custom meal size", () => {
  beforeEach(reset);
  afterAll(reset);

  it("rejects a guest ordering a custom size", async () => {
    const size = await customSize();
    await expect(createOrder(input(size.publicId))).rejects.toThrow(/isn't available/);
  });

  it("allows staff (allowCustomMeal) and prices it per TU", async () => {
    const size = await customSize();
    const r = await createOrder(input(size.publicId), { allowCustomMeal: true });
    const [o] = await db.select().from(orders).where(eq(orders.publicId, r.publicId));
    expect(o.mealSizeId).toBe(size.id);
    expect(Number(o.perTiffinPrice)).toBeGreaterThanOrEqual(8); // 2 TU × $4, before tier uplift
  });

  it("rejects the owner renewing a custom size themselves (staff only)", async () => {
    const size = await customSize();
    const first = await createOrder(input(size.publicId), { allowCustomMeal: true });
    const [o] = await db.select({ userId: orders.userId }).from(orders).where(eq(orders.publicId, first.publicId));
    const [u] = await db.select({ publicId: users.publicId }).from(users).where(eq(users.id, o.userId!));
    // Any terminal value of the orderStatus enum (check db/schema/orders.ts) so the overlap guard passes.
    await db.update(orders).set({ status: "completed" }).where(eq(orders.publicId, first.publicId));
    await expect(createOrder(input(size.publicId), { ownerUserId: u.publicId })).rejects.toThrow(/isn't available/);
  });

  it("rejects another customer's custom size", async () => {
    const size = await customSize();
    await createOrder(input(size.publicId), { allowCustomMeal: true });
    await expect(createOrder(input(size.publicId, "+14165550199", "other@example.com"))).rejects.toThrow(/isn't available/);
  });

  it("applies and records a staff base price override", async () => {
    const size = await customSize();
    const r = await createOrder(input(size.publicId), { allowCustomMeal: true, basePriceOverride: 6, actorId: null });
    const [o] = await db.select().from(orders).where(eq(orders.publicId, r.publicId));
    expect((o.pricingSnapshot as { basePriceOverride?: { amount: number; computed: number } }).basePriceOverride).toMatchObject({ amount: 6, computed: 8 });
  });

  it("refuses an override on a catalog size", async () => {
    const snap = await loadCatalogSnapshot();
    const regular = snap.mealSizes.find((m) => !m.custom && m.planKey === "veg")!;
    await expect(createOrder(input(regular.publicId), { allowCustomMeal: true, basePriceOverride: 1 })).rejects.toThrow(/custom meals only/);
  });
});
