import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryCategorySwaps, ledgerEntries, mealSizeItems, mealSizes, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot, invalidateCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { applyDeliverySwap } = await import("../category-swaps.service");
const { dishCategoriesService } = await import("../dish-categories.service");

const createdOrderIds: bigint[] = [];
const createdUserIds: bigint[] = [];
const createdPairIds: string[] = [];

afterEach(async () => {
  const orderIds = createdOrderIds.splice(0);
  const userIds = createdUserIds.splice(0);
  const pairIds = createdPairIds.splice(0);
  if (orderIds.length) {
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, orderIds));
    await db.delete(payments).where(inArray(payments.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }
  for (const id of pairIds) await dishCategoriesService.removeSwapPair(id).catch(() => {});
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  await invalidateCatalogSnapshot();
});

async function fetchOrder(publicId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
  createdOrderIds.push(order.id);
  if (order.userId) createdUserIds.push(order.userId);
  return order;
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

// Any meal size with >=2 distinct categories — eligibility is global now
// (category_swap_pairs), so the meal size itself no longer determines whether a
// swap is possible, only whether both categories are present on it.
// Picked from the END of the list, not mealSizes[0] — swap-fanout.test.ts picks
// the first meal size for its own maxTuAmount-mutating fixture, and these run
// concurrently against the same live DB (no per-file isolation on seed rows).
async function mealSizeWithTwoCategories() {
  const snap = await loadCatalogSnapshot();
  const size = [...snap.mealSizes].reverse().find((s) => new Set(s.items.map((i) => i.category)).size >= 2);
  if (!size) throw new Error("No 2+-category meal size in the seed for this test");
  return size;
}

// Idempotent: the seed already wires some pairs globally (roti/rice,
// salad/raita, ...), and mealSizeWithTwoCategories() can land on a meal size
// whose two categories are one of those. Only track (for cleanup) a pair this
// call actually created — never delete one that was already seeded.
async function allowPair(from: string, to: string) {
  const existing = await dishCategoriesService.isSwapPairAllowed(from, to);
  if (existing) return;
  const pair = await dishCategoriesService.addSwapPair(from, to);
  createdPairIds.push(pair.publicId);
}

describe("applyDeliverySwap", () => {
  it("applies a swap between two globally-eligible categories the meal size actually has", async () => {
    const size = await mealSizeWithTwoCategories();
    const snap = await loadCatalogSnapshot();
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
    const [from, to] = [...new Set(size.items.map((i) => i.category))];
    await allowPair(from, to);

    const { publicId } = await createOrder(orderInput(size.publicId, planKey));
    const order = await fetchOrder(publicId);
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);

    await applyDeliverySwap(delivery.publicId, from, to, 1, null);

    const [swap] = await db.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, delivery.id));
    expect(swap.fromCategory).toBe(from);
    expect(swap.toCategory).toBe(to);
    expect(swap.qtyFrom).toBe(1);
    expect(swap.qtyTo).toBeGreaterThan(0);
  });

  it("rejects a pair that isn't globally eligible", async () => {
    const size = await mealSizeWithTwoCategories();
    const snap = await loadCatalogSnapshot();
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
    const [from, to] = [...new Set(size.items.map((i) => i.category))];
    // Deliberately no allowPair() call — but the seed already wires some pairs
    // globally (roti/rice, salad/raita, ...), and this meal size's own pair
    // might already be one of them. If so, remove it for this test only and
    // restore the exact same row (by id) once done.
    const pairs = await dishCategoriesService.listSwapPairs();
    const seeded = pairs.find((p) => p.fromKey === from && p.toKey === to);
    if (seeded) await dishCategoriesService.removeSwapPair(seeded.id);

    try {
      const { publicId } = await createOrder(orderInput(size.publicId, planKey));
      const order = await fetchOrder(publicId);
      const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);

      await expect(applyDeliverySwap(delivery.publicId, from, to, 1, null))
        .rejects.toThrow(/can't be swapped/i);
    } finally {
      if (seeded) await dishCategoriesService.addSwapPair(from, to);
    }
  });

  it("rejects a category not on the meal size", async () => {
    const size = await mealSizeWithTwoCategories();
    const snap = await loadCatalogSnapshot();
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
    const from = size.items[0].category;
    // A real, globally-enabled category the meal size just doesn't happen to have.
    const enabled = await dishCategoriesService.enabledCategories();
    const onSize = new Set(size.items.map((i) => i.category));
    const off = enabled.find((c) => !onSize.has(c.key));
    if (!off) throw new Error("Every enabled category is on this meal size — need a different fixture");
    await allowPair(from, off.key);

    const { publicId } = await createOrder(orderInput(size.publicId, planKey));
    const order = await fetchOrder(publicId);
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);

    await expect(applyDeliverySwap(delivery.publicId, from, off.key, 1, null))
      .rejects.toThrow(/must be part of this meal size/i);
  });

  it("rejects swapping a category with itself", async () => {
    const size = await mealSizeWithTwoCategories();
    const snap = await loadCatalogSnapshot();
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
    const { publicId } = await createOrder(orderInput(size.publicId, planKey));
    const order = await fetchOrder(publicId);
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);
    const from = size.items[0].category;

    await expect(applyDeliverySwap(delivery.publicId, from, from, 1, null))
      .rejects.toThrow(/two different categories/i);
  });

  it("enforces maxTuAmount on the destination category", async () => {
    const size = await mealSizeWithTwoCategories();
    const snap = await loadCatalogSnapshot();
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
    const [from, to] = [...new Set(size.items.map((i) => i.category))];
    await allowPair(from, to);

    // Cap the destination at its current TU so any swap into it overflows. Scoped
    // to THIS meal size — a category can have many rows across other meal sizes
    // now that qty removal made each row one pick, so an unscoped query could
    // silently cap an unrelated meal size instead of the one under test.
    const [{ id: mealSizeId }] = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.publicId, size.publicId)).limit(1);
    const [toItemRow] = await db.select({ id: mealSizeItems.id, tuAmount: mealSizeItems.tuAmount })
      .from(mealSizeItems).where(and(eq(mealSizeItems.mealSizeId, mealSizeId), eq(mealSizeItems.category, to))).limit(1);
    await db.update(mealSizeItems).set({ maxTuAmount: toItemRow.tuAmount }).where(eq(mealSizeItems.id, toItemRow.id));

    try {
      const { publicId } = await createOrder(orderInput(size.publicId, planKey));
      const order = await fetchOrder(publicId);
      const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);

      await expect(applyDeliverySwap(delivery.publicId, from, to, 1, null))
        .rejects.toThrow(/limit for this meal size/i);
    } finally {
      await db.update(mealSizeItems).set({ maxTuAmount: null }).where(eq(mealSizeItems.id, toItemRow.id));
    }
  });
});
