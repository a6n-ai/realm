import { afterEach, describe, expect, it, vi } from "vitest";
import { asc, eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { scheduleFromPool } = await import("../deliveries.service");
const { coveredDates } = await import("@/lib/menu/coverage");

const createdOrderIds: bigint[] = [];
const createdUserIds: bigint[] = [];

afterEach(async () => {
  const orderIds = createdOrderIds.splice(0);
  const userIds = createdUserIds.splice(0);
  if (orderIds.length) {
    await db.delete(orderActivities).where(inArray(orderActivities.orderId, orderIds));
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, orderIds));
    await db.delete(payments).where(inArray(payments.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
});

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
    contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`,  fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  createdOrderIds.push(o.id);
  if (o.userId) createdUserIds.push(o.userId);
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
    coversDates: [deliveryDate],
    tiffinUnits: 1,
  })));
}

async function rowsFor(o: { id: bigint }) {
  return db.select().from(deliveries).where(eq(deliveries.orderId, o.id)).orderBy(asc(deliveries.deliveryDate));
}

async function setPool(o: { id: bigint }, pooled: number, persons = 1) {
  await db.update(orders).set({ pooledTiffinCount: pooled, persons }).where(eq(orders.id, o.id));
}

describe("scheduleFromPool (integration)", () => {
  it("rejects when the pool is empty", async () => {
    const o = await makeOrder();
    await seedWeeks(o);
    await setPool(o, 0);
    await expect(scheduleFromPool(o.publicId, "2030-01-21", 1n)).rejects.toThrow("No tiffins left to schedule");
  });

  it("rejects a new trip on or before the last delivery when no occupant to merge", async () => {
    const o = await makeOrder();
    await seedWeeks(o);
    await setPool(o, 1);
    await db.delete(deliveries).where(eq(deliveries.orderId, o.id));
    await db.insert(deliveries).values([
      { orderId: o.id, deliveryDate: "2030-01-18", status: "scheduled", cutoffAt: Date.now() + 1e9, coversDates: ["2030-01-18"], tiffinUnits: 1 },
    ]);
    await expect(scheduleFromPool(o.publicId, "2030-01-16", 1n)).rejects.toThrow("Date must be after your last delivery");
  });

  it("snaps Saturday onto Friday and merges onto the existing Friday trip", async () => {
    const o = await makeOrder();
    await seedWeeks(o);
    await setPool(o, 1);
    const res = await scheduleFromPool(o.publicId, "2030-01-19", 1n);
    expect(res.carriedOn).toBe("2030-01-18");
    expect(res.merged).toBe(true);
    const [fri] = await db.select().from(deliveries).where(eq(deliveries.publicId, res.deliveryPublicId));
    expect(coveredDates(fri).includes("2030-01-19")).toBe(true);
    expect(fri.tiffinUnits).toBeGreaterThanOrEqual(2);
    const [order] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(order.pooledTiffinCount).toBe(0);
  });

  it("schedules a row after the last delivery, links a pooled miss, and decrements the pool by persons", async () => {
    const o = await makeOrder();
    await seedWeeks(o);
    await setPool(o, 2, 2);
    const [first] = await rowsFor(o);
    await db.update(deliveries)
      .set({ status: "skipped", cutoffAt: Date.now() - 1, pooledAt: Date.now() })
      .where(eq(deliveries.id, first.id));

    const { deliveryPublicId, carriedOn, merged } = await scheduleFromPool(o.publicId, "2030-01-21", 1n);
    expect(deliveryPublicId).toBeTruthy();
    expect(carriedOn).toBe("2030-01-21");
    expect(merged).toBe(false);

    const [order] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(order.pooledTiffinCount).toBe(0);

    const [created] = await db.select().from(deliveries).where(eq(deliveries.publicId, deliveryPublicId));
    expect(created.deliveryDate).toBe("2030-01-21");
    expect(created.status).toBe("scheduled");
    expect(created.makeupForDeliveryId).toBe(first.id);
    expect(coveredDates(created)).toEqual(["2030-01-21"]);
  });

  it("never links a make-up to a merged source, only to a real pooled miss", async () => {
    const o = await makeOrder();
    await seedWeeks(o);
    await setPool(o, 1);
    const [a, b, c] = await rowsFor(o);
    await db.update(deliveries).set({ status: "skipped", cutoffAt: Date.now() - 1, mergedIntoDeliveryId: c.id }).where(eq(deliveries.id, a.id));
    await db.update(deliveries).set({ status: "skipped", cutoffAt: Date.now() - 1, pooledAt: Date.now() }).where(eq(deliveries.id, b.id));

    const { deliveryPublicId } = await scheduleFromPool(o.publicId, "2030-01-21", 1n);
    const [created] = await db.select().from(deliveries).where(eq(deliveries.publicId, deliveryPublicId));
    expect(created.makeupForDeliveryId).toBe(b.id);
  });

  it("rejects past carrying-trip cutoff", async () => {
    const o = await makeOrder();
    await seedWeeks(o);
    await setPool(o, 1);
    await expect(scheduleFromPool(o.publicId, "2020-01-06", 1n)).rejects.toThrow(/past|cutoff/i);
  });
});
