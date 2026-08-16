// Applying/removing an admin-defined category swap on one specific delivery.
// Modeled directly on setDeliveryAddress/clearDeliveryAddress in deliveries.service.ts:
// same transaction + advisory-lock + assertMutable shape, same "log an orderActivities
// row" convention. Kept in its own file rather than folded into deliveries.service.ts,
// same reasoning selections.service.ts is its own file — swap-specific validation
// (rule lookup, stack-aware quantity bound check) is unrelated to general delivery
// mutation.
import { ValidationError } from "@realm/commons";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { categorySwapRules, deliveryCategorySwaps, orderActivities, orders } from "@/db/schema";
import { validateSwapStack } from "@/lib/menu/resolve-delivery-meal";
import { assertMutable, loadByPublicId, loadOrderIdByPublicId } from "./deliveries.service";

export async function applyDeliverySwap(
  deliveryPublicId: string,
  ruleId: bigint,
  actorId: bigint | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    // Re-read post-lock: a concurrent request may have mutated this row while we waited.
    const row = await loadByPublicId(tx, deliveryPublicId);
    assertMutable(row);
    if (row.status !== "scheduled") throw new ValidationError(`Cannot swap on a ${row.status} delivery`);

    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new ValidationError("Order not found");

    const [rule] = await tx.select().from(categorySwapRules).where(eq(categorySwapRules.id, ruleId)).limit(1);
    if (!rule) throw new ValidationError("Swap rule not found");
    if (rule.mealSizeId !== order.mealSizeId) throw new ValidationError("This swap doesn't apply to your meal size");

    // Stack-aware bound check: fold every swap already applied to this delivery before
    // checking whether fromCategory has enough left to give up — a customer can stack
    // several different swaps on one day, but never past what's actually there.
    const existing = await tx.select({
      fromCategory: deliveryCategorySwaps.fromCategory, toCategory: deliveryCategorySwaps.toCategory,
      qtyFrom: deliveryCategorySwaps.qtyFrom, qtyTo: deliveryCategorySwaps.qtyTo,
    }).from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, row.id));
    const check = validateSwapStack(order.categoryCounts ?? {}, existing, rule);
    if (!check.ok) throw new ValidationError(check.reason);

    const [already] = await tx.select({ id: deliveryCategorySwaps.id }).from(deliveryCategorySwaps)
      .where(and(eq(deliveryCategorySwaps.deliveryId, row.id), eq(deliveryCategorySwaps.ruleId, ruleId)))
      .limit(1);
    if (already) throw new ValidationError("This swap is already applied to this delivery");

    // Snapshot the rule's quantities onto the applied row — never re-read from the rule
    // after this, so an admin editing/deleting it can't retroactively change what was
    // already applied to an upcoming delivery.
    await tx.insert(deliveryCategorySwaps).values({
      deliveryId: row.id, ruleId: rule.id,
      fromCategory: rule.fromCategory, toCategory: rule.toCategory,
      qtyFrom: rule.qtyFrom, qtyTo: rule.qtyTo,
      toWeightValue: rule.toWeightValue, toWeightUnit: rule.toWeightUnit,
    });
    await tx.insert(orderActivities).values({
      orderId, deliveryId: row.id, type: "category_swap_applied",
      note: `${rule.qtyFrom} ${rule.fromCategory} → ${rule.qtyTo} ${rule.toCategory}`,
      createdBy: actorId,
    });
  });
}

export async function removeDeliverySwap(
  deliveryPublicId: string,
  appliedSwapPublicId: string,
  actorId: bigint | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    const row = await loadByPublicId(tx, deliveryPublicId);
    assertMutable(row);
    if (row.status !== "scheduled") throw new ValidationError(`Cannot remove a swap on a ${row.status} delivery`);

    const deleted = await tx.delete(deliveryCategorySwaps)
      .where(and(eq(deliveryCategorySwaps.publicId, appliedSwapPublicId), eq(deliveryCategorySwaps.deliveryId, row.id)))
      .returning({ fromCategory: deliveryCategorySwaps.fromCategory, toCategory: deliveryCategorySwaps.toCategory });
    if (deleted.length === 0) throw new ValidationError("Swap not found on this delivery");

    await tx.insert(orderActivities).values({
      orderId, deliveryId: row.id, type: "category_swap_removed",
      note: `Removed ${deleted[0].fromCategory} → ${deleted[0].toCategory}`,
      createdBy: actorId,
    });
  });
}
