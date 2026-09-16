// Business rule: a non-veg tiffin may trade its curry for sabzi/daal in any mix, but
// never ends up with more than one non-veg curry — enforced by dish_categories
// .max_picks_per_tiffin on Curry, however swaps stack.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { desc, eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, deliveryCategorySwaps, dishCategories, ledgerEntries, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot, invalidateCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { applyDeliverySwap } = await import("../category-swaps.service");
const { dishCategoriesService } = await import("../dish-categories.service");

let priorCap: number | null = null;
const createdPairIds: string[] = [];
const createdOrderIds: bigint[] = [];
const createdUserIds: bigint[] = [];

beforeAll(async () => {
  const [curry] = await db.select({ cap: dishCategories.maxPicksPerTiffin }).from(dishCategories).where(eq(dishCategories.key, "curry"));
  priorCap = curry?.cap ?? null;
  await db.update(dishCategories).set({ maxPicksPerTiffin: 1 }).where(eq(dishCategories.key, "curry"));
  for (const [from, to] of [["daal", "curry"], ["curry", "daal"], ["curry", "sabzi"], ["sabzi", "curry"]]) {
    if (!(await dishCategoriesService.isSwapPairAllowed(from, to))) {
      createdPairIds.push((await dishCategoriesService.addSwapPair(from, to)).publicId);
    }
  }
});

afterAll(async () => {
  await db.update(dishCategories).set({ maxPicksPerTiffin: priorCap }).where(eq(dishCategories.key, "curry"));
  for (const id of createdPairIds) await dishCategoriesService.removeSwapPair(id).catch(() => {});
});

afterEach(async () => {
  const orderIds = createdOrderIds.splice(0);
  const userIds = createdUserIds.splice(0);
  if (orderIds.length) {
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, orderIds));
    await db.delete(payments).where(inArray(payments.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  await invalidateCatalogSnapshot();
});

// A "Curry + Daal" non-veg thali (4-item regular) — no sabzi on the composition.
async function curryDaalDelivery() {
  const snap = await loadCatalogSnapshot();
  const size = snap.mealSizes.find((s) => {
    const cats = new Set(s.items.map((i) => i.category));
    return cats.has("curry") && cats.has("daal") && !cats.has("sabzi") && s.items.filter((i) => i.category === "curry").length === 1;
  });
  if (!size) throw new Error("Seed has no curry + daal meal size without sabzi");
  const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
  const { publicId } = await createOrder({
    planKey,
    selections: {
      mealSizeId: size.publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1,
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
  // Latest day, so the cutoff is never already past when the suite runs late in the day.
  const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).orderBy(desc(deliveries.deliveryDate)).limit(1);
  return delivery;
}

describe("one non-veg curry per tiffin", () => {
  it("blocks swapping daal into a second curry", async () => {
    const d = await curryDaalDelivery();
    await expect(applyDeliverySwap(d.publicId, "daal", "curry", 1, null)).rejects.toThrow(/At most 1 curry per tiffin/);
  });

  it("allows trading the curry for daal (2 daal)", async () => {
    const d = await curryDaalDelivery();
    await applyDeliverySwap(d.publicId, "curry", "daal", 1, null);
    const swaps = await db.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, d.id));
    expect(swaps).toMatchObject([{ fromCategory: "curry", toCategory: "daal", qtyFrom: 1, qtyTo: 1 }]);
  });

  it("allows trading the curry for a sabzi the meal size doesn't include", async () => {
    const d = await curryDaalDelivery();
    await applyDeliverySwap(d.publicId, "curry", "sabzi", 1, null);
    const swaps = await db.select().from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, d.id));
    expect(swaps).toMatchObject([{ fromCategory: "curry", toCategory: "sabzi", qtyFrom: 1, qtyTo: 1 }]);
  });

  it("lets the curry come back once it was swapped out, but still only one", async () => {
    const d = await curryDaalDelivery();
    await applyDeliverySwap(d.publicId, "curry", "daal", 1, null); // curry 0, daal 2
    await applyDeliverySwap(d.publicId, "daal", "curry", 1, null); // curry 1, daal 1
    await expect(applyDeliverySwap(d.publicId, "daal", "curry", 1, null)).rejects.toThrow(/At most 1 curry per tiffin/);
  });

  it("offers curry -> sabzi in the swap drawer for that meal size", async () => {
    const d = await curryDaalDelivery();
    const [order] = await db.select({ mealSizeId: orders.mealSizeId }).from(orders).where(eq(orders.id, d.orderId));
    const pairs = await dishCategoriesService.swapPairsForMealSize(order.mealSizeId);
    expect(pairs).toContainEqual({ fromCategory: "curry", toCategory: "sabzi" });
  });
});
