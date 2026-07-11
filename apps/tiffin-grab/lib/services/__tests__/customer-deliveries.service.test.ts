import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday, NotFoundError } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder, cancelOrder } = await import("../orders.service");
const { assertOwnsDelivery, assertOwnsOrder, myActiveSubscriptions, myDeliveries } = await import("../customer-deliveries.service");

// Wide enough to bracket any real nextWeekday()-derived delivery date, regardless of "today".
const FROM = "2000-01-01";
const UNTIL = "2100-12-31";

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

// M5V is a seeded Toronto zone -> lands "active" with materialized rows.
async function makeOrder(phone: string, fullName: string) {
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
    contact: { fullName, phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return o;
}

async function firstDeliveryOf(order: { id: bigint }) {
  const [row] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
  return row;
}

async function userIdByPhone(phone: string) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
  return row.id;
}

const PHONE_A = "+16475550301";
const PHONE_B = "+16475550302";

describe("customer-deliveries.service (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("myDeliveries unions a user's subscriptions, date-ordered, tagged by order", async () => {
    const aOrder1 = await makeOrder(PHONE_A, "User A");
    const aOrder2 = await makeOrder(PHONE_A, "User A"); // same phone -> same user, second active order
    await makeOrder(PHONE_B, "User B");
    const userA = await userIdByPhone(PHONE_A);

    const rows = await myDeliveries(userA, FROM, UNTIL);
    expect(rows.every((r) => r.orderPublicId)).toBe(true);
    expect(new Set(rows.map((r) => r.orderPublicId))).toEqual(new Set([aOrder1.publicId, aOrder2.publicId]));
    const dates = rows.map((r) => r.deliveryDate);
    expect(dates).toEqual([...dates].sort());
  });

  it("myActiveSubscriptions returns only the caller's active/paused orders", async () => {
    const aOrder1 = await makeOrder(PHONE_A, "User A");
    const aOrder2 = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    await cancelOrder(bOrder.publicId); // cancelled, and would also fail the userId scoping check
    const userA = await userIdByPhone(PHONE_A);

    const subs = await myActiveSubscriptions(userA);
    expect(new Set(subs.map((s) => s.publicId))).toEqual(new Set([aOrder1.publicId, aOrder2.publicId]));
    expect(subs.every((s) => ["active", "paused"].includes(s.status))).toBe(true);
  });

  it("never returns another user's deliveries", async () => {
    await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const userA = await userIdByPhone(PHONE_A);

    const rows = await myDeliveries(userA, FROM, UNTIL);
    expect(rows.some((r) => r.orderPublicId === bOrder.publicId)).toBe(false);
  });

  it("excludes cancelled orders and cancelled deliveries", async () => {
    await makeOrder(PHONE_A, "User A");
    const aSecondOrder = await makeOrder(PHONE_A, "User A");
    const userA = await userIdByPhone(PHONE_A);

    await cancelOrder(aSecondOrder.publicId); // marks rows cancelled

    const rows = await myDeliveries(userA, FROM, UNTIL);
    expect(rows.some((r) => r.orderPublicId === aSecondOrder.publicId)).toBe(false);
  });

  it("assertOwnsDelivery throws NotFoundError for another user's delivery", async () => {
    await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const userA = await userIdByPhone(PHONE_A);
    const bDelivery = await firstDeliveryOf(bOrder);

    await expect(assertOwnsDelivery(userA, bDelivery.publicId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("assertOwnsDelivery resolves for the owner", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const userA = await userIdByPhone(PHONE_A);
    const aDelivery = await firstDeliveryOf(aOrder);

    await expect(assertOwnsDelivery(userA, aDelivery.publicId)).resolves.toBeUndefined();
  });

  it("assertOwnsDelivery throws NotFoundError for a non-existent public id", async () => {
    await makeOrder(PHONE_A, "User A");
    const userA = await userIdByPhone(PHONE_A);

    await expect(assertOwnsDelivery(userA, "dlv_doesnotexist")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("assertOwnsOrder throws NotFoundError for another user's order and resolves for the owner", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const userA = await userIdByPhone(PHONE_A);

    await expect(assertOwnsOrder(userA, bOrder.publicId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(assertOwnsOrder(userA, aOrder.publicId)).resolves.toBeUndefined();
    await expect(assertOwnsOrder(userA, "ord_doesnotexist")).rejects.toBeInstanceOf(NotFoundError);
  });
});
