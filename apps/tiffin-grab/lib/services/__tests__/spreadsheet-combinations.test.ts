// Promoted from a scratch verification pass against Combination Meals.xlsx
// (the business's real curated meal-composition rules). The curry/NonVeg-cap
// scenarios that used to live here were dropped when 'curry' merged into
// 'sabzi' (db/seed.sql) — direction is governed dynamically by
// plans.restricted + category_swap_pairs now, not a per-category pick cap, so
// there is nothing curry-specific left to assert. What's left: the
// maxTuAmount-bounded salad/raita pair, and a plain sabzi<->daal swap.
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryCategorySwaps, ledgerEntries, orders, payments, users } = await import("@/db/schema");
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
// pairs globally (daal<->sabzi, salad->raita, roti<->rice) — only track (for
// cleanup) a pair this call actually created.
async function allowPair(from: string, to: string) {
  const existing = await dishCategoriesService.swapPairExists(from, to);
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
  const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);
  return { order, delivery };
}

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

describe("Sabzi Only (Veg) — freely interchangeable Sabzi/Daal pool, no NonVeg present (Combination Meals.xlsx)", () => {
  it("Sabzi<->Daal swap succeeds, landing where expected (no cap on this all-veg pool)", async () => {
    // No global pair exists for sabzi<->daal in the seed (only daal<->sabzi,
    // salad->raita, roti<->rice are wired) — this meal size has no separate
    // curry slot to reuse an existing pair from, so add one for this test.
    await allowPair("sabzi", "daal");
    const { delivery } = await orderFor("sabzi_only_regular_veg");
    await applyDeliverySwap(delivery.publicId, "sabzi", "daal", 1, null);
    const [swap] = await db.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, delivery.id));
    expect(swap.fromCategory).toBe("sabzi");
    expect(swap.toCategory).toBe("daal");
    expect(swap.qtyTo).toBeGreaterThan(0);
  });
});
