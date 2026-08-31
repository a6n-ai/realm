import { afterEach, describe, expect, it, vi } from "vitest";
import { asc, eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryCategorySwaps, ledgerEntries, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { rescheduleDelivery } = await import("../deliveries.service");
const { applyDeliverySwap } = await import("../category-swaps.service");

// Scoped cleanup: track exactly what this test created (orders/users) and
// delete only those rows. Deliveries, delivery_category_swaps and order_activities
// cascade off orders.id, so deleting the order is enough for them; payments and
// ledger_entries have no cascade and must go first.
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

async function fetchOrder(publicId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
  createdOrderIds.push(order.id);
  if (order.userId) createdUserIds.push(order.userId);
  return order;
}

// rice<->roti is a pair the seed already wires globally — no ad-hoc pair
// creation (and no risk of colliding with another test file's concurrent
// mutation of the same seed rows). Any meal size that actually has both.
async function mealSizeWithRiceAndRoti() {
  const snap = await loadCatalogSnapshot();
  const size = snap.mealSizes.find((s) => {
    const cats = new Set(s.items.map((i) => i.category));
    return cats.has("rice") && cats.has("roti");
  });
  if (!size) throw new Error("Seed has no meal size with both rice and roti — needed for this test");
  return size;
}

function orderInput(mealSizeId: string, planKey: string) {
  return {
    planKey,
    selections: {
      mealSizeId,
      frequencyKey: "5_day" as const,
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: {
      email: `u${Math.random().toString(36).slice(2)}@test.invalid`,
      fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6",
    },
  };
}

describe("delivery swap reschedule carry-over", () => {
  it("carries a day's own swap onto its rescheduled replacement", async () => {
    const size = await mealSizeWithRiceAndRoti();
    const snap = await loadCatalogSnapshot();
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
    const { publicId } = await createOrder(orderInput(size.publicId, planKey));
    const order = await fetchOrder(publicId);

    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id))
      .orderBy(asc(deliveries.deliveryDate));
    const source = rows[0];
    // Give up the single rice pick (1 TU) — roti is 0.25 TU/pick, so this buys
    // exactly 4 roti picks (matches the real business ratio from the spreadsheet).
    await applyDeliverySwap(source.publicId, "rice", "roti", 1, null);

    // A day the order does not already cover, on the same weekday pattern.
    const target = rows[rows.length - 1].deliveryDate;
    const nextIso = new Date(`${target}T00:00:00.000Z`);
    nextIso.setUTCDate(nextIso.getUTCDate() + 7);

    await rescheduleDelivery(source.publicId, nextIso.toISOString().slice(0, 10), null);

    const [replacement] = await db.select().from(deliveries)
      .where(eq(deliveries.makeupForDeliveryId, source.id)).limit(1);
    const swaps = await db.select().from(deliveryCategorySwaps)
      .where(eq(deliveryCategorySwaps.deliveryId, replacement.id));
    expect(swaps).toHaveLength(1);
    expect(swaps[0].fromCategory).toBe("rice");
    expect(swaps[0].toCategory).toBe("roti");
    expect(swaps[0].qtyFrom).toBe(1);
    expect(swaps[0].qtyTo).toBe(4);
  });
});
