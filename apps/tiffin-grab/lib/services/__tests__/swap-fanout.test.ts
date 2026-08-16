import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, inArray, ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { categorySwapRules, deliveries, deliveryCategorySwaps, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot, invalidateCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { rescheduleDelivery } = await import("../deliveries.service");
const { applyDeliverySwap } = await import("../category-swaps.service");

// This suite truncates category_swap_rules in beforeEach. Safe because
// vitest.config.ts sets fileParallelism: false — test FILES never run
// concurrently, so this can't race the swap-rule-portion.test.ts suite that
// also uses this table; it only ever races itself, serially.
async function reset() {
  await db.delete(deliveryCategorySwaps);
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

describe("default swap fan-out", () => {
  it("gives every materialized delivery the order's default swaps", async () => {
    const { rule, size, from, to } = await seedRule();
    const snap = await loadCatalogSnapshot();
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
    const { publicId } = await createOrder(orderInput(size.publicId, planKey, [rule.publicId]));

    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
    expect(rows.length).toBeGreaterThan(0);

    const swaps = await db.select().from(deliveryCategorySwaps)
      .where(inArray(deliveryCategorySwaps.deliveryId, rows.map((r) => r.id)));
    expect(swaps).toHaveLength(rows.length);
    expect(swaps[0].fromCategory).toBe(from);
    expect(swaps[0].toCategory).toBe(to);
    expect(swaps[0].ruleId).toBe(rule.id);
  });

  it("keeps writing the snapshot after the rule is deleted", async () => {
    const { rule, size } = await seedRule();
    const snap = await loadCatalogSnapshot();
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
    const { publicId } = await createOrder(orderInput(size.publicId, planKey, [rule.publicId]));
    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);

    await db.delete(categorySwapRules).where(eq(categorySwapRules.id, rule.id));
    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
    const swaps = await db.select().from(deliveryCategorySwaps)
      .where(inArray(deliveryCategorySwaps.deliveryId, rows.map((r) => r.id)));
    // rule_id carries no FK, so the delete leaves it pointing at a dead id — the
    // snapshotted quantities are what the composition is built from, and they survive.
    expect(swaps[0].qtyFrom).toBe(rule.qtyFrom);
    expect(swaps[0].fromCategory).toBe(rule.fromCategory);
  });

  it("carries a day's own swaps onto its rescheduled replacement", async () => {
    const { rule, size } = await seedRule();
    const snap = await loadCatalogSnapshot();
    const planKey = snap.plans.find((p) => p.id === size.planId)!.key;
    // No default swaps at all — the order's own default set is empty, so it
    // cannot masquerade as the source of what lands on the replacement.
    const { publicId } = await createOrder(orderInput(size.publicId, planKey, []));
    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
    expect(order.defaultSwaps).toEqual([]);

    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id))
      .orderBy(asc(deliveries.deliveryDate));
    const source = rows[0];
    // Ad-hoc swap applied to this ONE delivery only — not via order.default_swaps.
    await applyDeliverySwap(source.publicId, rule.id, null);

    // A day the order does not already cover, on the same weekday pattern.
    const target = rows[rows.length - 1].deliveryDate;
    const nextIso = new Date(`${target}T00:00:00.000Z`);
    nextIso.setUTCDate(nextIso.getUTCDate() + 7);

    await rescheduleDelivery(source.publicId, nextIso.toISOString().slice(0, 10), null);

    const [replacement] = await db.select().from(deliveries)
      .where(eq(deliveries.makeupForDeliveryId, source.id)).limit(1);
    const swaps = await db.select().from(deliveryCategorySwaps)
      .where(eq(deliveryCategorySwaps.deliveryId, replacement.id));
    // Under inheritDefaultSwaps (the wrong path here) this would be empty,
    // since order.default_swaps is []. Non-empty proves reschedule copied
    // from the source delivery's own applied swaps instead.
    expect(swaps).toHaveLength(1);
    expect(swaps[0].fromCategory).toBe(rule.fromCategory);
    expect(swaps[0].toCategory).toBe(rule.toCategory);
    expect(swaps[0].qtyFrom).toBe(rule.qtyFrom);
    expect(swaps[0].qtyTo).toBe(rule.qtyTo);
  });
});
