// A make-up staff put on hold must still be movable (it relocates itself, never spawns a make-up
// of a make-up), and no move may land on a day the customer's renewal already delivers on.
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { rescheduleDelivery } = await import("../deliveries.service");

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
  if (userIds.length) await db.delete(users).where(inArray(users.id, [...new Set(userIds)]));
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
const weekdayAfter = (date: string) => iso(nextWeekday(new Date(`${date}T00:00:00Z`)));

async function makeOrder(startDate: string, email = `u${Math.random().toString(36).slice(2)}@test.invalid`, phone = `+1647555${Math.floor(1000 + Math.random() * 9000)}`) {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await createOrder({
    planKey: snap.plans[0].key,
    selections: { mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"], includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate },
    contact: { email, fullName: "A B", phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
  createdOrderIds.push(order.id);
  if (order.userId) createdUserIds.push(order.userId);
  return { order, email, phone };
}

const rowsOf = (orderId: bigint) => db.select().from(deliveries).where(eq(deliveries.orderId, orderId)).orderBy(asc(deliveries.deliveryDate));

describe("rescheduleDelivery on a held make-up", () => {
  it("moves the make-up row itself back to scheduled on the new day", async () => {
    const { order } = await makeOrder(weekdayAfter(iso(new Date(Date.now() + 3 * 864e5))));
    const rows = await rowsOf(order.id);
    const last = rows.at(-1)!.deliveryDate;
    await rescheduleDelivery(rows[0]!.publicId, weekdayAfter(last), null);
    const [makeup] = await db.select().from(deliveries).where(eq(deliveries.makeupForDeliveryId, rows[0]!.id));
    expect(makeup).toBeDefined();
    // Staff put the make-up on hold (admin "On hold").
    await db.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.id, makeup!.id));

    const target = weekdayAfter(makeup!.deliveryDate);
    await expect(rescheduleDelivery(makeup!.publicId, target, null)).resolves.toMatchObject({ merged: false });
    const [moved] = await db.select().from(deliveries).where(eq(deliveries.id, makeup!.id));
    expect(moved).toMatchObject({ deliveryDate: target, status: "scheduled", makeupForDeliveryId: rows[0]!.id });
    expect(await db.select().from(deliveries).where(eq(deliveries.makeupForDeliveryId, makeup!.id))).toHaveLength(0);
  });
});

describe("rescheduleDelivery onto a renewal day", () => {
  it("refuses a day the customer's next plan already delivers on", async () => {
    const first = await makeOrder(weekdayAfter(iso(new Date(Date.now() + 3 * 864e5))));
    const firstRows = await rowsOf(first.order.id);
    const renewalStart = weekdayAfter(firstRows.at(-1)!.deliveryDate);
    const renewal = await makeOrder(renewalStart, first.email, first.phone);
    expect(renewal.order.userId).toBe(first.order.userId);
    const [renewalDay] = await db.select().from(deliveries)
      .where(and(eq(deliveries.orderId, renewal.order.id), eq(deliveries.deliveryDate, renewalStart)));
    expect(renewalDay).toBeDefined();

    await expect(rescheduleDelivery(firstRows[0]!.publicId, renewalStart, null)).rejects.toThrow(/renewal already delivers/);
  });
});
