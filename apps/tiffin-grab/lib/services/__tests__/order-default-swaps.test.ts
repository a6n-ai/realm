import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { categorySwapRules, deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot, invalidateCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");

// This suite truncates category_swap_rules in beforeEach. Safe because
// vitest.config.ts sets fileParallelism: false — test FILES never run
// concurrently, so this can't race the swap-rule-portion.test.ts suite that
// also uses this table; it only ever races itself, serially.
async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
  await db.delete(categorySwapRules);
  await invalidateCatalogSnapshot();
}
beforeEach(reset);
afterAll(reset);

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
    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);

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
    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
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
