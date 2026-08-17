import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { categorySwapRules, ledgerEntries, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot, invalidateCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");

// Scoped cleanup: track exactly what this test created (orders/users/rules) and
// delete only those rows. Deliveries, delivery_category_swaps and order_activities
// cascade off orders.id, so deleting the order is enough for them; payments and
// ledger_entries have no cascade and must go first.
const createdOrderIds: bigint[] = [];
const createdUserIds: bigint[] = [];
const createdRuleIds: bigint[] = [];

afterEach(async () => {
  const orderIds = createdOrderIds.splice(0);
  const userIds = createdUserIds.splice(0);
  const ruleIds = createdRuleIds.splice(0);
  if (orderIds.length) {
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, orderIds));
    await db.delete(payments).where(inArray(payments.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }
  if (ruleIds.length) await db.delete(categorySwapRules).where(inArray(categorySwapRules.id, ruleIds));
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  await invalidateCatalogSnapshot();
});

async function fetchOrder(publicId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
  createdOrderIds.push(order.id);
  if (order.userId) createdUserIds.push(order.userId);
  return order;
}

// The first meal size, plus a rule it can actually afford: give up 1 of the
// category its own composition has the most of.
async function seedRule(qtyFrom = 1, portion: { value: string; unit: "g" } | null = null) {
  const snap = await loadCatalogSnapshot();
  const size = snap.mealSizes[0];
  const counts = size.items.reduce<Record<string, number>>((a, i) => {
    a[i.category] = (a[i.category] ?? 0) + i.qty;
    return a;
  }, {});
  const from = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const to = `${from}-swapped`;
  const [rule] = await db.insert(categorySwapRules).values({
    mealSizeId: size.id,
    fromCategory: from,
    toCategory: to,
    qtyFrom,
    qtyTo: 1,
    toWeightValue: portion?.value ?? null,
    toWeightUnit: portion?.unit ?? null,
  }).returning();
  createdRuleIds.push(rule.id);
  await invalidateCatalogSnapshot();
  return { rule, size, from, to };
}

function orderInput(mealSizeId: string, planKey: string, swapRuleIds: string[]) {
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
      swapRuleIds,
    },
    contact: {
      email: `u${Math.random().toString(36).slice(2)}@test.invalid`,
      fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6",
    },
  };
}

describe("createOrder default swaps", () => {
  it("snapshots the chosen rule onto orders.default_swaps", async () => {
    const { rule, size, from, to } = await seedRule(1, { value: "250.00", unit: "g" });
    const snap = await loadCatalogSnapshot();
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;

    const { publicId } = await createOrder(orderInput(size.publicId, planKey, [rule.publicId]));
    const order = await fetchOrder(publicId);

    expect(order.defaultSwaps).toEqual([{
      ruleId: rule.publicId,
      fromCategory: from,
      toCategory: to,
      qtyFrom: 1,
      qtyTo: 1,
      toWeightValue: "250.00",
      toWeightUnit: "g",
    }]);
    // categoryCounts stays the UNSWAPPED base — swaps fold on top at read time.
    expect(order.categoryCounts[from]).toBeGreaterThan(0);
  });

  it("defaults to an empty array when no swaps are chosen", async () => {
    const snap = await loadCatalogSnapshot();
    const size = snap.mealSizes[0];
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
    const { publicId } = await createOrder(orderInput(size.publicId, planKey, []));
    const order = await fetchOrder(publicId);
    expect(order.defaultSwaps).toEqual([]);
  });

  it("rejects a rule that belongs to another meal size", async () => {
    const { rule } = await seedRule();
    const snap = await loadCatalogSnapshot();
    const other = snap.mealSizes.find((m) => m.publicId !== snap.mealSizes[0].publicId)!;
    const planKey = snap.plans.find((p) => p.id === other.planId)!.key;
    await expect(createOrder(orderInput(other.publicId, planKey, [rule.publicId])))
      .rejects.toThrow(/meal size/i);
  });

  it("rejects an overdrawing set of swaps", async () => {
    // qtyFrom deliberately larger than the composition holds.
    const { rule, size } = await seedRule(99);
    const snap = await loadCatalogSnapshot();
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
    await expect(createOrder(orderInput(size.publicId, planKey, [rule.publicId])))
      .rejects.toThrow(/left to give up/i);
  });

  it("rejects the same rule twice", async () => {
    const { rule, size } = await seedRule();
    const snap = await loadCatalogSnapshot();
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
    await expect(createOrder(orderInput(size.publicId, planKey, [rule.publicId, rule.publicId])))
      .rejects.toThrow(/twice|duplicate/i);
  });

  it("rejects an unknown rule id", async () => {
    const snap = await loadCatalogSnapshot();
    const size = snap.mealSizes[0];
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
    await expect(createOrder(orderInput(size.publicId, planKey, ["csr_does_not_exist"])))
      .rejects.toThrow(/not found/i);
  });
});
