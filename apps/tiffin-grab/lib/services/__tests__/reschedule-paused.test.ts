// Vacation (paused) trips can still be moved: actionAvailability offers Move for them, so the
// service must accept it (rescheduleDelivery's mutableStatuses includes "paused").
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { rescheduleDelivery, pauseRange } = await import("../deliveries.service");

const createdOrderIds: bigint[] = [];
const createdUserIds: bigint[] = [];

afterEach(async () => {
  const orderIds = createdOrderIds.splice(0);
  const userIds = createdUserIds.splice(0);
  if (orderIds.length) {
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, orderIds));
    await db.delete(payments).where(inArray(payments.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
});

async function makeOrder(includeWeekend: boolean, frequencyKey = "5_day") {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId,
      frequencyKey,
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: includeWeekend,
      includeSunday: includeWeekend,
      durationWeeks: 1,
      startDate: nextWeekday(new Date(Date.now() + 3 * 864e5)).toISOString().slice(0, 10),
    },
    contact: {
      email: `u${Math.random().toString(36).slice(2)}@test.invalid`,
      fullName: "A B", phone: `+1647555${Math.floor(1000 + Math.random() * 9000)}`, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6",
    },
  });
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
  createdOrderIds.push(order.id);
  if (order.userId) createdUserIds.push(order.userId);
  return order;
}

async function firstDeliveryOf(order: { id: bigint }) {
  const [row] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);
  return row;
}

describe("rescheduleDelivery on a vacation (paused) trip", () => {
  it("moves the paused day to a later plan day, matching actionAvailability's Move offer", async () => {
    const order = await makeOrder(false);
    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
    const dates = rows.map((r) => r.deliveryDate).sort();
    await pauseRange(order.publicId, dates[0], dates[dates.length - 1]);
    const paused = (await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)))
      .find((r) => r.deliveryDate === dates[0])!;
    expect(paused.status).toBe("paused");
    const target = nextWeekday(new Date(`${dates[dates.length - 1]}T00:00:00Z`)).toISOString().slice(0, 10);
    await expect(rescheduleDelivery(paused.publicId, target, null)).resolves.toMatchObject({ merged: false });
  });
});
