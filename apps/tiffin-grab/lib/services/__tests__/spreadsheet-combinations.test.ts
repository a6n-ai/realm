// Promoted from a scratch verification pass against Combination Meals.xlsx
// (the business's real curated meal-composition rules). Covers the two
// structurally distinct patterns found there: a pooled curry group with a
// per-category cap (NonVeg limited to 1 unit), and a maxTuAmount-bounded pair.
// No literal admin-set ratio assertions — swaps are flat 1 TU-for-1 TU now,
// derived from each category's own tuAmount, not a per-meal-size rule.
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
  if (pairIds.length) await invalidateCatalogSnapshot();
});

// Idempotent, mirrors adhoc-swap.test.ts's helper: the seed already wires some
// pairs globally (daal<->curry, salad->raita, roti<->rice) — only track (for
// cleanup) a pair this call actually created.
async function allowPair(from: string, to: string) {
  const existing = await dishCategoriesService.isSwapPairAllowed(from, to);
  if (existing) return;
  const pair = await dishCategoriesService.addSwapPair(from, to);
  createdPairIds.push(pair.publicId);
}

async function orderFor(mealSizeKey: string) {
  const snap = await loadCatalogSnapshot();
  const size = snap.mealSizes.find((s) => s.key === mealSizeKey);
  if (!size) throw new Error(`Seed is missing meal size "${mealSizeKey}" — this test needs it`);
  const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
  const { publicId } = await createOrder({
    planKey,
    selections: {
      mealSizeId: size.publicId,
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
      fullName: "A B", phone: "+16475550199", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6",
    },
  });
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
  createdOrderIds.push(order.id);
  if (order.userId) createdUserIds.push(order.userId);
  const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);
  return { order, delivery };
}

describe("Maharaja curry pool — NonVeg capped at 1 unit (Combination Meals.xlsx)", () => {
  it("swapping daal into an already-full curry slot is rejected (the pool never holds 2 NonVeg)", async () => {
    const { delivery } = await orderFor("maharaja_nonveg");
    // Base composition already has 1 curry (maxTuAmount=1) — any further swap
    // into curry must overflow the cap, exactly like the spreadsheet's "at
    // most 1x NonVeg-type" rule across the pool.
    await expect(applyDeliverySwap(delivery.publicId, "daal", "curry", 1, null))
      .rejects.toThrow(/limit for this meal size/i);
  });

  it("swapping curry away for daal reaches an all-veg-pool composition, matching a listed combo", async () => {
    const { delivery } = await orderFor("maharaja_nonveg");
    // Spreadsheet lists (Dal, Dal, Dal) as a valid all-veg-pool composition —
    // giving up the single curry pick for daal reaches that.
    await applyDeliverySwap(delivery.publicId, "curry", "daal", 1, null);
    const [swap] = await db.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, delivery.id));
    expect(swap.fromCategory).toBe("curry");
    expect(swap.toCategory).toBe("daal");
  });
});

describe("Maharaja dedicated salad/raita slot — exclusivity via one-directional rule (Combination Meals.xlsx)", () => {
  it("can stack raita up to its cap by repeatedly swapping the single salad pick", async () => {
    const { delivery } = await orderFor("maharaja_veg");
    // Base: 1 salad, 1 raita. salad->raita is the only rule that ever exists
    // for this pair — after using the one salad pick, nothing is left to swap.
    await applyDeliverySwap(delivery.publicId, "salad", "raita", 1, null);
    const [swap] = await db.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, delivery.id));
    expect(swap.fromCategory).toBe("salad");
    expect(swap.toCategory).toBe("raita");

    await expect(applyDeliverySwap(delivery.publicId, "salad", "raita", 1, null))
      .rejects.toThrow(/not enough/i);
  });

  it("rejects the reverse direction — raita can never be traded back for salad", async () => {
    const { delivery } = await orderFor("maharaja_veg");
    await expect(applyDeliverySwap(delivery.publicId, "raita", "salad", 1, null))
      .rejects.toThrow(/can't be swapped/i);
  });
});

describe("Sabzi Only (Non-Veg) curry pool — same cap mechanism as Maharaja, different meal size (Combination Meals.xlsx)", () => {
  // Unlike maharaja_nonveg, this meal size's Curry row has no maxTuAmount in
  // the seed (uncapped) — the spreadsheet's "at most 1x NonVeg-type across the
  // pool" rule isn't wired here by default. Set it temporarily, same technique
  // adhoc-swap.test.ts uses to prove the cap mechanism, to confirm it
  // generalizes to a second meal size rather than being maharaja-specific.
  async function withTemporaryCurryCap<T>(fn: () => Promise<T>): Promise<T> {
    const [{ id: mealSizeId }] = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.key, "sabzi_only_nonveg")).limit(1);
    const [curryItem] = await db.select({ id: mealSizeItems.id, tuAmount: mealSizeItems.tuAmount })
      .from(mealSizeItems).where(and(eq(mealSizeItems.mealSizeId, mealSizeId), eq(mealSizeItems.category, "curry"))).limit(1);
    await db.update(mealSizeItems).set({ maxTuAmount: curryItem.tuAmount }).where(eq(mealSizeItems.id, curryItem.id));
    try {
      return await fn();
    } finally {
      await db.update(mealSizeItems).set({ maxTuAmount: null }).where(eq(mealSizeItems.id, curryItem.id));
      await invalidateCatalogSnapshot();
    }
  }

  it("swapping daal into an already-full curry slot is rejected", async () => {
    await withTemporaryCurryCap(async () => {
      const { delivery } = await orderFor("sabzi_only_nonveg");
      await expect(applyDeliverySwap(delivery.publicId, "daal", "curry", 1, null))
        .rejects.toThrow(/limit for this meal size/i);
    });
  });

  it("swapping curry away for daal reaches an all-veg-pool composition, matching a listed combo", async () => {
    await withTemporaryCurryCap(async () => {
      const { delivery } = await orderFor("sabzi_only_nonveg");
      // Spreadsheet lists (Sabzi, Dal, Dal) as a valid all-veg-pool composition.
      await applyDeliverySwap(delivery.publicId, "curry", "daal", 1, null);
      const [swap] = await db.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, delivery.id));
      expect(swap.fromCategory).toBe("curry");
      expect(swap.toCategory).toBe("daal");
    });
  });
});

describe("Sabzi Only (Veg) — freely interchangeable Sabzi/Daal pool, no NonVeg present (Combination Meals.xlsx)", () => {
  it("Sabzi<->Daal swap succeeds, landing where expected (no cap on this all-veg pool)", async () => {
    // No global pair exists for sabzi<->daal in the seed (only daal<->curry,
    // salad->raita, roti<->rice are wired) — this meal size has no curry slot
    // to reuse an existing pair from, so add one for this test.
    await allowPair("sabzi", "daal");
    const { delivery } = await orderFor("sabzi_only_veg");
    await applyDeliverySwap(delivery.publicId, "sabzi", "daal", 1, null);
    const [swap] = await db.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, delivery.id));
    expect(swap.fromCategory).toBe("sabzi");
    expect(swap.toCategory).toBe("daal");
    expect(swap.qtyTo).toBeGreaterThan(0);
  });
});

// 4-Item and 5-Item Non-Veg Thali (Regular) deliberately NOT covered here: their
// meal_size_items (Curry/Daal/Rice/Roti, seed.sql) are structurally identical to
// sabzi_only_nonveg above — same uncapped Curry, same daal<->curry pair, no
// different cap value or extra pool member to exercise a code path the tests
// above don't already prove. A third instance of the identical mechanism adds
// no coverage.
