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
//
// Final validation (divisibility, stack, maxPicksPerTiffin, maxTuAmount) lives in
// lib/menu/meal-validation.ts — shared with listValidSwapOptionsForDelivery so
// apply never accepts a quantity the options API would not have offered.
import { ValidationError } from "@foundry/commons";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryCategorySwaps, orderActivities, orders } from "@/db/schema";
import { validateProposedSwap } from "@/lib/menu/meal-validation";
import { coveredDates, swapAppliesTo } from "@/lib/menu/coverage";
import { assertMutable, loadByPublicId, loadOrderIdByPublicId } from "./deliveries.service";
import { dishCategoriesService } from "./dish-categories.service";
import { loadCompositionContext } from "./swap-options.service";

export async function applyDeliverySwap(
  deliveryPublicId: string,
  fromCategory: string,
  toCategory: string,
  fromPicks: number,
  actorId: bigint | null,
  /** Eating day (ISO) the swap is for; must be one the trip covers. Omitted = the trip's own date. */
  forDate?: string,
): Promise<void> {
  if (!Number.isInteger(fromPicks) || fromPicks <= 0) throw new ValidationError("Pick count must be a positive whole number");

  await db.transaction(async (tx) => {
    const orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    // Re-read post-lock: a concurrent request may have mutated this row while we waited.
    const row = await loadByPublicId(tx, deliveryPublicId);
    assertMutable(row);
    if (row.status !== "scheduled") throw new ValidationError(`Cannot swap on a ${row.status} delivery`);
    const eatingDate = forDate ?? row.deliveryDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eatingDate)) throw new ValidationError("Swap date must be ISO YYYY-MM-DD");
    if (!coveredDates(row).includes(eatingDate)) throw new ValidationError("This delivery doesn't cover that day");
    // NULL keeps legacy semantics (trip's own date) for the readers that resolve it.
    const storedForDate = eatingDate === row.deliveryDate ? null : eatingDate;

    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new ValidationError("Order not found");

    const allowed = await dishCategoriesService.isSwapPairAllowedForMealSize(fromCategory, toCategory, order.mealSizeId);
    if (!allowed) throw new ValidationError(`${fromCategory} can't be swapped for ${toCategory} on this plan`);

    const composition = await loadCompositionContext(order.mealSizeId, order.categoryCounts ?? {});
    const existing = await tx.select({
      fromCategory: deliveryCategorySwaps.fromCategory, toCategory: deliveryCategorySwaps.toCategory,
      qtyFrom: deliveryCategorySwaps.qtyFrom, qtyTo: deliveryCategorySwaps.qtyTo, forDate: deliveryCategorySwaps.forDate,
    }).from(deliveryCategorySwaps).where(eq(deliveryCategorySwaps.deliveryId, row.id))
      .then((rs) => rs.filter((r) => swapAppliesTo(r.forDate, row.deliveryDate, eatingDate)));

    const check = validateProposedSwap({
      composition,
      applied: existing.map((r) => ({
        fromCategory: r.fromCategory,
        toCategory: r.toCategory,
        qtyFrom: r.qtyFrom,
        qtyTo: r.qtyTo,
      })),
      next: { fromCategory, toCategory, fromPicks },
    });
    if (!check.ok) throw new ValidationError(check.reason);
    const qtyTo = check.qtyTo;

    // Snapshot the derived quantities onto the applied row — never re-read from
    // meal_size_items after this, so a later admin edit to a category's tuAmount
    // can't retroactively change a swap a customer already applied.
    await tx.insert(deliveryCategorySwaps).values({
      deliveryId: row.id, fromCategory, toCategory, qtyFrom: fromPicks, qtyTo, forDate: storedForDate,
    });
    await tx.insert(orderActivities).values({
      orderId, deliveryId: row.id, type: "category_swap_applied",
      note: `${fromPicks} ${fromCategory} → ${qtyTo} ${toCategory} (eat ${eatingDate})`,
      createdBy: actorId,
    });
  });
}

export async function removeDeliverySwap(
  deliveryPublicId: string,
  appliedSwapPublicId: string,
  actorId: bigint | null,
  forDate?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
    const row = await loadByPublicId(tx, deliveryPublicId);
    assertMutable(row);
    if (row.status !== "scheduled") throw new ValidationError(`Cannot remove a swap on a ${row.status} delivery`);

    if (forDate) {
      if (!coveredDates(row).includes(forDate)) throw new ValidationError("This delivery doesn't cover that day");
      const [swap] = await tx.select({ forDate: deliveryCategorySwaps.forDate }).from(deliveryCategorySwaps)
        .where(and(eq(deliveryCategorySwaps.publicId, appliedSwapPublicId), eq(deliveryCategorySwaps.deliveryId, row.id))).limit(1);
      if (swap && !swapAppliesTo(swap.forDate, row.deliveryDate, forDate)) throw new ValidationError("Swap not found on that day");
    }
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
