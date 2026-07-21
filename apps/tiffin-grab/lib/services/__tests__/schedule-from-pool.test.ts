import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, ne } from "drizzle-orm";
import { nextWeekday, ValidationError } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { scheduleFromPool } = await import("../deliveries.service");

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

async function makeOrder() {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId,
      frequencyKey: "5_day",
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return o;
}

// Deterministic Mon-Fri x2 weeks; last delivery = 2030-01-18 (Fri). 2030-01-07 is a Monday.
async function seedWeeks(o: { id: bigint }) {
  await db.delete(deliveries).where(eq(deliveries.orderId, o.id));
  const dates = [
    "2030-01-07", "2030-01-08", "2030-01-09", "2030-01-10", "2030-01-11",
    "2030-01-14", "2030-01-15", "2030-01-16", "2030-01-17", "2030-01-18",
  ];
  await db.insert(deliveries).values(dates.map((deliveryDate) => ({
    orderId: o.id, deliveryDate, status: "scheduled" as const, cutoffAt: Date.now() + 1e9,
  })));
}

async function rowsFor(o: { id: bigint }) {
  return db.select().from(deliveries).where(eq(deliveries.orderId, o.id)).orderBy(asc(deliveries.deliveryDate));
}

async function setPool(o: { id: bigint }, pooled: number, persons = 1) {
  await db.update(orders).set({ pooledTiffinCount: pooled, persons }).where(eq(orders.id, o.id));
}

describe("scheduleFromPool (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("rejects when the pool is empty", async () => {
    const o = await makeOrder();
    await seedWeeks(o);
    await setPool(o, 0);
    await expect(scheduleFromPool(o.publicId, "2030-01-21", 1n)).rejects.toThrow("No tiffins left to schedule");
  });

  it("rejects a date on or before the last delivery", async () => {
    const o = await makeOrder();
    await seedWeeks(o);
    await setPool(o, 1);
    await expect(scheduleFromPool(o.publicId, "2030-01-18", 1n)).rejects.toThrow("Date must be after your last delivery");
  });

  it("rejects a weekday not in the plan", async () => {
    const o = await makeOrder();
    await seedWeeks(o);
    await setPool(o, 1);
    // 2030-01-19 is a Saturday, after the last delivery but not a 5-day plan weekday.
    await expect(scheduleFromPool(o.publicId, "2030-01-19", 1n)).rejects.toThrow("That day isn't on your plan");
  });

  it("schedules a row after the last delivery, links a pooled miss, and decrements the pool by persons", async () => {
    const o = await makeOrder();
    await seedWeeks(o);
    await setPool(o, 2, 2); // persons = 2
    // Make row[0] a pooled miss so scheduleFromPool has something to link the make-up to.
    const [first] = await rowsFor(o);
    await db.update(deliveries)
      .set({ status: "skipped", cutoffAt: Date.now() - 1, pooledAt: Date.now() })
      .where(eq(deliveries.id, first.id));

    const { deliveryPublicId } = await scheduleFromPool(o.publicId, "2030-01-21", 1n);
    expect(deliveryPublicId).toBeTruthy();

    const [order] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(order.pooledTiffinCount).toBe(0); // 2 - persons(2)

    const [created] = await db.select().from(deliveries).where(eq(deliveries.publicId, deliveryPublicId));
    expect(created.deliveryDate).toBe("2030-01-21");
    expect(created.status).toBe("scheduled");
    expect(created.makeupForDeliveryId).toBe(first.id);
  });
});
