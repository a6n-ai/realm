// Applying/removing a category swap on one specific delivery. Modeled directly on
// setDeliveryAddress/clearDeliveryAddress in deliveries.service.ts: same
// transaction + advisory-lock + assertMutable shape, same "log an orderActivities
// row" convention. Kept in its own file rather than folded into
// deliveries.service.ts, same reasoning selections.service.ts is its own file.
//
// There is no per-meal-size ratio rule anymore — every swap is a flat 1 TU-for-1
// TU trade, gated only by the global category_swap_pairs eligibility table
// (dish-categories.service.ts). The customer picks HOW MANY PICKS of fromCategory
// to give up (a whole number, the human-facing unit); the TU that buys is spent on
// toCategory at that category's own per-pick tuAmount, which must divide evenly —
// e.g. giving up 1 rice pick (1 TU) into roti (0.25 TU/pick) buys exactly 4 roti
// picks, matching the pick-count-driven categoryCounts/pickIndex machinery
// unchanged (see lib/menu/resolve-delivery-meal.ts).
import { ValidationError } from "@foundry/commons";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryCategorySwaps, mealSizeItems, orderActivities, orders } from "@/db/schema";
import { applySwapsToCounts, validateSwapStack } from "@/lib/menu/resolve-delivery-meal";
import { capViolation, swapQuantities } from "@/lib/menu/swap-rules";
import { assertMutable, loadByPublicId, loadOrderIdByPublicId } from "./deliveries.service";
import { dishCategoriesService } from "./dish-categories.service";

export async function applyDeliverySwap(
  deliveryPublicId: string,
  fromCategory: string,
  toCategory: string,
  fromPicks: number,
  actorId: bigint | null,
): Promise<void> {
  if (fromCategory === toCategory) throw new ValidationError("Choose two different categories to swap");
  if (!Number.isInteger(fromPicks) || fromPicks <= 0) throw new ValidationError("Pick count must be a positive whole number");

  await db.transaction(async (tx) => {
    const allowed = await dishCategoriesService.isSwapPairAllowed(fromCategory, toCategory);
    if (!allowed) throw new ValidationError(`${fromCategory} can't be swapped for ${toCategory}`);

    const orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    // Re-read post-lock: a concurrent request may have mutated this row while we waited.
    const row = await loadByPublicId(tx, deliveryPublicId);
    assertMutable(row);
    if (row.status !== "scheduled") throw new ValidationError(`Cannot swap on a ${row.status} delivery`);

    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new ValidationError("Order not found");

    const cats = await dishCategoriesService.swapCategoriesForMealSize(order.mealSizeId);
    const from = cats.get(fromCategory);
    const to = cats.get(toCategory);
    if (!from || !to) throw new ValidationError("Both categories must be part of this plan");
    const quantities = swapQuantities(from, to, fromPicks);
    if (!quantities.ok) throw new ValidationError(quantities.reason);
    const qtyTo = quantities.qtyTo;

    // Stack-aware bound check: fold every swap already applied to this delivery before
    // checking whether fromCategory has enough left to give up — a customer can stack
    // several different swaps on one day, but never past what's actually there.
    const existing = await tx.select({
      fromCategory: deliveryCategorySwaps.fromCategory, toCategory: deliveryCategorySwaps.toCategory,
      qtyFrom: deliveryCategorySwaps.qtyFrom, qtyTo: deliveryCategorySwaps.qtyTo,
    }).from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, row.id));
    const check = validateSwapStack(order.categoryCounts ?? {}, existing, { fromCategory, toCategory, qtyFrom: fromPicks, qtyTo });
    if (!check.ok) throw new ValidationError(check.reason);

    const effective = applySwapsToCounts(order.categoryCounts ?? {}, [...existing, { fromCategory, toCategory, qtyFrom: fromPicks, qtyTo }]);
    // Per-tiffin pick cap (Curry = 1 keeps a non-veg tiffin to one non-veg curry).
    const cap = capViolation(effective, to);
    if (cap) throw new ValidationError(cap);

    // maxTuAmount cap: TU total after this swap = (pick count already resolved into
    // toCategory, folded through every applied swap + this one) × its own per-pick tuAmount.
    // A category can have several rows (a row is one pick) but only one may carry the
    // cap — take whichever has it, so it's never skipped by landing on an uncapped row.
    const [capRow] = await tx.select({ maxTuAmount: mealSizeItems.maxTuAmount }).from(mealSizeItems)
      .where(and(eq(mealSizeItems.mealSizeId, order.mealSizeId), eq(mealSizeItems.category, toCategory), isNotNull(mealSizeItems.maxTuAmount)))
      .limit(1);
    if (capRow?.maxTuAmount != null && to.pickTu != null) {
      const resultingTu = (effective[toCategory] ?? 0) * to.pickTu;
      if (resultingTu > Number(capRow.maxTuAmount)) {
        throw new ValidationError(`This swap would exceed the ${toCategory} limit for this meal size`);
      }
    }

    // Snapshot the derived quantities onto the applied row — never re-read from
    // meal_size_items after this, so a later admin edit to a category's tuAmount
    // can't retroactively change a swap a customer already applied.
    await tx.insert(deliveryCategorySwaps).values({
      deliveryId: row.id, fromCategory, toCategory, qtyFrom: fromPicks, qtyTo,
    });
    await tx.insert(orderActivities).values({
      orderId, deliveryId: row.id, type: "category_swap_applied",
      note: `${fromPicks} ${fromCategory} → ${qtyTo} ${toCategory}`,
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
