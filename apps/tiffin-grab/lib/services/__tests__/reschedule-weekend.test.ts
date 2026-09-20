// There is no physical Saturday/Sunday delivery — a weekend add-on always bundles onto that
// week's Friday row (materializeDeliveries). rescheduleDelivery must refuse to create a
// standalone weekend row, even for an order whose plan itself includes weekend add-ons
// (includeSaturday/includeSunday just changes how many tiffins Friday's row carries, not
// whether Saturday gets its own row).
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
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
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: {
      email: `u${Math.random().toString(36).slice(2)}@test.invalid`,
      fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6",
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

const WEEKEND_MESSAGE =
  "We don't deliver on weekends — a Saturday or Sunday tiffin ships with the same week's Friday delivery instead. Pick a weekday.";

// A Saturday/Sunday at least 2 weeks out, so it's never past cutoff regardless of when the
// suite runs.
function farFutureWeekendIso(day: "sat" | "sun"): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 21);
  // Walk forward to the requested weekday (0 = Sun, 6 = Sat).
  const target = day === "sun" ? 0 : 6;
  while (d.getUTCDay() !== target) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe("rescheduleDelivery rejects weekend targets", () => {
  it("rejects Saturday even for a plan without weekend add-ons", async () => {
    const order = await makeOrder(false);
    const delivery = await firstDeliveryOf(order);
    await expect(rescheduleDelivery(delivery.publicId, farFutureWeekendIso("sat"), null))
      .rejects.toThrow(WEEKEND_MESSAGE);
  });

  it("rejects Sunday even for a plan WITH weekend add-ons priced in", async () => {
    // includeSaturday/includeSunday only changes Friday's tiffinUnits — it never opens up a
    // real Sunday row as a valid target, so this must fail with the same explanation, not
    // silently succeed just because Sunday is technically "on the plan".
    const order = await makeOrder(true);
    const delivery = await firstDeliveryOf(order);
    await expect(rescheduleDelivery(delivery.publicId, farFutureWeekendIso("sun"), null))
      .rejects.toThrow(WEEKEND_MESSAGE);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, delivery.id));
    expect(row.status).toBe("scheduled"); // untouched — rejected before any mutation
  });
});

function farFutureIso(dow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 21);
  while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe("rescheduleDelivery for eatingDays orders", () => {
  it("allows only the frequency's delivery days, never weekends", async () => {
    const order = await makeOrder(false, "mwf");
    await db.update(orders).set({ eatingDays: ["mon", "wed", "fri", "sat", "sun"] }).where(eq(orders.id, order.id));
    const delivery = await firstDeliveryOf(order);
    await expect(rescheduleDelivery(delivery.publicId, farFutureIso(2), null)).rejects.toThrow("That day isn't on your plan");
    await expect(rescheduleDelivery(delivery.publicId, farFutureWeekendIso("sat"), null)).rejects.toThrow(WEEKEND_MESSAGE);
    await expect(rescheduleDelivery(delivery.publicId, farFutureWeekendIso("sun"), null)).rejects.toThrow(WEEKEND_MESSAGE);
    await expect(rescheduleDelivery(delivery.publicId, farFutureIso(3), null)).resolves.toEqual({ merged: false });
  });
});
