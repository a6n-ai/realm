import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

async function makeOrder(mealSizeKey: string, phone: string) {
  const snap = await loadCatalogSnapshot();
  const mealSize = snap.mealSizes.find((m) => m.key === mealSizeKey);
  if (!mealSize) throw new Error(`Meal size ${mealSizeKey} not seeded`);
  const { publicId } = await createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: mealSize.publicId,
      frequencyKey: "5_day",
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    // M5V is a seeded Toronto zone -> order lands "active".
    contact: { fullName: "A B", phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return o;
}

describe("createOrder snapshots category_counts from the meal size (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("Small Thali order snapshots {sabzi:1,rice:1,roti:2}", async () => {
    const order = await makeOrder("small_thali", "+16475550121");
    expect(order.categoryCounts).toEqual({ sabzi: 1, rice: 1, roti: 2 });
    // jsonb round-trips with a canonical (non-insertion-order) key order, so
    // compare mealSlots vs Object.keys(categoryCounts) as sets.
    expect(new Set(order.mealSlots)).toEqual(new Set(Object.keys(order.categoryCounts)));
  });

  it("Maharaja Veg order snapshots a distinct, richer category_counts", async () => {
    const order = await makeOrder("maharaja_veg", "+16475550122");
    expect(order.categoryCounts).toEqual({
      sabzi: 1,
      daal: 1,
      extra: 1,
      salad: 1,
      raita: 1,
      rice: 1,
      roti: 8,
    });
    expect(new Set(order.mealSlots)).toEqual(new Set(Object.keys(order.categoryCounts)));
  });

  it("differs between meal sizes on the same plan", async () => {
    const small = await makeOrder("small_thali", "+16475550123");
    const maharaja = await makeOrder("maharaja_veg", "+16475550124");
    expect(small.categoryCounts).not.toEqual(maharaja.categoryCounts);
  });
});
