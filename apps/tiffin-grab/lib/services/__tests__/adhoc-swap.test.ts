import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";
import { applySwapsToCounts, swapQuantities } from "@/lib/menu/swap-rules";
import { computeSwapOption } from "@/lib/menu/meal-validation";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryCategorySwaps, dishCategories, ledgerEntries, mealSizeItems, mealSizes, orders, payments, plans, users } = await import("@/db/schema");
const { loadCatalogSnapshot, invalidateCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { applyDeliverySwap } = await import("../category-swaps.service");
const { dishCategoriesService } = await import("../dish-categories.service");
const { loadCompositionContext } = await import("../swap-options.service");

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

/** Prefer a directional pair that the shared validator can actually apply (divisible TU). */
async function swappablePair(order: { mealSizeId: bigint; categoryCounts: Record<string, number> | null }, cats: string[]) {
  const composition = await loadCompositionContext(order.mealSizeId, order.categoryCounts ?? {});
  for (const from of cats) {
    for (const to of cats) {
      if (from === to) continue;
      const opt = computeSwapOption({ composition, applied: [], fromCategory: from, toCategory: to });
      if (opt.validBundles[0]) return { from, to, fromPicks: opt.validBundles[0].fromPicks };
    }
  }
  // Fall back: same-category self-swap always divides 1↔1 when the category is present.
  const self = cats[0]!;
  return { from: self, to: self, fromPicks: 1 };
}

/** First fromPicks that divides evenly (ignores Max TU) — for asserting Max TU rejection. */
async function firstDivisibleFromPicks(order: { mealSizeId: bigint; categoryCounts: Record<string, number> | null }, from: string, to: string) {
  const composition = await loadCompositionContext(order.mealSizeId, order.categoryCounts ?? {});
  const fromCat = composition.categories.get(from);
  const toCat = composition.categories.get(to);
  if (!fromCat || !toCat) throw new Error("categories missing from composition");
  const have = order.categoryCounts?.[from] ?? 0;
  for (let q = 1; q <= Math.max(have, 1); q++) {
    if (swapQuantities(fromCat, toCat, q).ok) return q;
  }
  throw new Error(`No divisible ${from}→${to} quantity on this meal size`);
}

// Idempotent: the seed already wires some pairs globally (roti/rice,
// salad/raita, ...), and mealSizeWithTwoCategories() can land on a meal size
// whose two categories are one of those. Only track (for cleanup) a pair this
// call actually created — never delete one that was already seeded.
async function allowPair(from: string, to: string, planId: bigint) {
  const existing = await dishCategoriesService.swapPairExists(from, to, planId);
  if (existing) return;
  const [plan] = await db.select({ publicId: plans.publicId }).from(plans).where(eq(plans.id, planId)).limit(1);
  const pair = await dishCategoriesService.addSwapPair(from, to, plan.publicId);
  createdPairIds.push(pair.publicId);
}

describe("applyDeliverySwap", () => {
  it("applies a swap between two globally-eligible categories the meal size actually has", async () => {
    const size = await mealSizeWithTwoCategories();
    const snap = await loadCatalogSnapshot();
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
    const cats = [...new Set(size.items.map((i) => i.category))];

    const { publicId } = await createOrder(orderInput(size.publicId, planKey));
    const order = await fetchOrder(publicId);
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);
    const { from, to, fromPicks } = await swappablePair(order, cats);
    await allowPair(from, to, size.planId);

    await applyDeliverySwap(delivery.publicId, from, to, fromPicks, null);

    const [swap] = await db.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, delivery.id));
    expect(swap.fromCategory).toBe(from);
    expect(swap.toCategory).toBe(to);
    expect(swap.qtyFrom).toBe(fromPicks);
    expect(swap.qtyTo).toBeGreaterThan(0);
  });

  it("rejects a pair that isn't globally eligible", async () => {
    const size = await mealSizeWithTwoCategories();
    const snap = await loadCatalogSnapshot();
    const plan = snap.plans.find((p) => p.id === size.planId)!;
    const planKey = plan.key;
    const [from, to] = [...new Set(size.items.map((i) => i.category))];
    // Deliberately no allowPair() call — but the seed already wires some pairs
    // for this plan (roti/rice, salad/raita, ...), and this meal size's own
    // pair might already be one of them. If so, remove it for this test only
    // and restore the exact same row (by id) once done.
    const pairs = await dishCategoriesService.listSwapPairs();
    const seeded = pairs.find((p) => p.fromKey === from && p.toKey === to && p.planId === plan.publicId);
    if (seeded) await dishCategoriesService.removeSwapPair(seeded.id);

    try {
      const { publicId } = await createOrder(orderInput(size.publicId, planKey));
      const order = await fetchOrder(publicId);
      const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);

      await expect(applyDeliverySwap(delivery.publicId, from, to, 1, null))
        .rejects.toThrow(/can't be swapped/i);
    } finally {
      if (seeded) await dishCategoriesService.addSwapPair(from, to, seeded.planId);
    }
  });

  // A category merely missing from the meal size is swappable when it shares a unit
  // (non-veg 4-item: curry -> sabzi) — see swap-rules.test.ts. Plan membership is the hard gate.
  it("rejects a category not attached to the order's plan", async () => {
    const size = await mealSizeWithTwoCategories();
    const snap = await loadCatalogSnapshot();
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
    const from = size.items[0].category;
    // The seeded catalog attaches every enabled category to every plan, so the test owns an
    // enabled category with no plan membership rather than hunting for one.
    const OFF_PLAN_KEY = "zz_off_plan_fixture";
    await db.delete(dishCategories).where(eq(dishCategories.key, OFF_PLAN_KEY));
    await db.insert(dishCategories).values({ key: OFF_PLAN_KEY, label: "Off-plan fixture", enabled: true });
    await invalidateCatalogSnapshot();
    try {
      await allowPair(from, OFF_PLAN_KEY, size.planId);

      const { publicId } = await createOrder(orderInput(size.publicId, planKey));
      const order = await fetchOrder(publicId);
      const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);

      await expect(applyDeliverySwap(delivery.publicId, from, OFF_PLAN_KEY, 1, null))
        .rejects.toThrow(/can't be swapped/i);
    } finally {
      for (const id of createdPairIds.splice(0)) await dishCategoriesService.removeSwapPair(id).catch(() => {});
      await db.delete(dishCategories).where(eq(dishCategories.key, OFF_PLAN_KEY));
    }
  });

  it("allows swapping a category with itself as a net-zero no-op", async () => {
    const size = await mealSizeWithTwoCategories();
    const snap = await loadCatalogSnapshot();
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
    const from = size.items[0].category;
    await allowPair(from, from, size.planId);

    const { publicId } = await createOrder(orderInput(size.publicId, planKey));
    const order = await fetchOrder(publicId);
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);
    const before = order.categoryCounts?.[from] ?? 0;

    await applyDeliverySwap(delivery.publicId, from, from, 1, null);

    const [swap] = await db.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, delivery.id));
    expect(swap.fromCategory).toBe(from);
    expect(swap.toCategory).toBe(from);
    expect(swap.qtyFrom).toBe(1);
    expect(swap.qtyTo).toBe(1);
    // Same category, same TU rate: giving up 1 pick and receiving 1 pick nets to zero.
    expect(applySwapsToCounts(order.categoryCounts ?? {}, [swap])[from]).toBe(before);
  });

  it("enforces maxTuAmount on the destination category", async () => {
    const size = await mealSizeWithTwoCategories();
    const snap = await loadCatalogSnapshot();
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
    const cats = [...new Set(size.items.map((i) => i.category))];

    const { publicId } = await createOrder(orderInput(size.publicId, planKey));
    const order = await fetchOrder(publicId);
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);

    // Pick a divisible cross-category pair first (before capping), then cap destination Max TU.
    let from = cats[0]!;
    let to = from;
    let fromPicks = 1;
    outer: for (const a of cats) {
      for (const b of cats) {
        if (a === b) continue;
        try {
          fromPicks = await firstDivisibleFromPicks(order, a, b);
          from = a;
          to = b;
          break outer;
        } catch {
          /* try next pair */
        }
      }
    }
    if (from === to) {
      throw new Error("Seed meal size has no divisible cross-category swap for Max TU fixture");
    }
    await allowPair(from, to, size.planId);

    const [{ id: mealSizeId }] = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.publicId, size.publicId)).limit(1);
    const toRows = await db.select({ id: mealSizeItems.id, tuAmount: mealSizeItems.tuAmount })
      .from(mealSizeItems).where(and(eq(mealSizeItems.mealSizeId, mealSizeId), eq(mealSizeItems.category, to)));
    const baseTu = toRows.reduce((s, r) => s + Number(r.tuAmount), 0);
    for (const r of toRows) await db.update(mealSizeItems).set({ maxTuAmount: String(baseTu) }).where(eq(mealSizeItems.id, r.id));

    try {
      await expect(applyDeliverySwap(delivery.publicId, from, to, fromPicks, null))
        .rejects.toThrow(/maximum .+ allowed in this meal/i);
    } finally {
      for (const r of toRows) await db.update(mealSizeItems).set({ maxTuAmount: null }).where(eq(mealSizeItems.id, r.id));
    }
  });
});
