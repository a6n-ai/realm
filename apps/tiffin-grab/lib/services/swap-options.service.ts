/**
 * Loads composition context and returns authoritative swap options for a
 * delivery/eating day. Customer and staff UIs should render this — not recompute
 * TU math client-side.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryCategorySwaps, dishCategories, mealSizeItems, orders } from "@/db/schema";
import {
  computeAllSwapOptions,
  type CompositionContext,
  type MealSizeItemRow,
  type SwapOption,
} from "@/lib/menu/meal-validation";
import { swapAppliesTo } from "@/lib/menu/coverage";
import type { SwapRow } from "@/lib/menu/swap-rules";
import { assertMutable, loadByPublicId, loadOrderIdByPublicId } from "./deliveries.service";
import { dishCategoriesService } from "./dish-categories.service";

export async function loadCompositionContext(mealSizeId: bigint, baseCounts: Record<string, number>): Promise<CompositionContext> {
  const [cats, items, labels] = await Promise.all([
    dishCategoriesService.swapCategoriesForMealSize(mealSizeId),
    db
      .select({
        category: mealSizeItems.category,
        tuAmount: mealSizeItems.tuAmount,
        maxTuAmount: mealSizeItems.maxTuAmount,
        sortOrder: mealSizeItems.sortOrder,
      })
      .from(mealSizeItems)
      .where(eq(mealSizeItems.mealSizeId, mealSizeId))
      .orderBy(asc(mealSizeItems.sortOrder)),
    db.select({ key: dishCategories.key, label: dishCategories.label }).from(dishCategories),
  ]);
  const mealSizeItemRows: MealSizeItemRow[] = items.map((i) => ({
    category: i.category,
    tuAmount: Number(i.tuAmount),
    maxTuAmount: i.maxTuAmount == null ? null : Number(i.maxTuAmount),
    sortOrder: i.sortOrder,
  }));
  const labelMap: Record<string, string> = {};
  for (const l of labels) labelMap[l.key] = l.label;
  return { baseCounts, mealSizeItems: mealSizeItemRows, categories: cats, labels: labelMap };
}

export async function listValidSwapOptionsForDelivery(
  deliveryPublicId: string,
  opts?: { forDate?: string; hideUnavailable?: boolean },
): Promise<SwapOption[]> {
  // loadByPublicId / loadOrderIdByPublicId are typed for transactions; a single
  // read-only txn keeps that contract without inventing a second loader.
  return db.transaction(async (tx) => {
    const orderId = await loadOrderIdByPublicId(tx, deliveryPublicId);
    const row = await loadByPublicId(tx, deliveryPublicId);
    assertMutable(row);
    const eatingDate = opts?.forDate ?? row.deliveryDate;

    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return [];

    const [composition, pairs, appliedRows] = await Promise.all([
      loadCompositionContext(order.mealSizeId, order.categoryCounts ?? {}),
      dishCategoriesService.swapPairsForMealSize(order.mealSizeId),
      tx
        .select({
          fromCategory: deliveryCategorySwaps.fromCategory,
          toCategory: deliveryCategorySwaps.toCategory,
          qtyFrom: deliveryCategorySwaps.qtyFrom,
          qtyTo: deliveryCategorySwaps.qtyTo,
          forDate: deliveryCategorySwaps.forDate,
        })
        .from(deliveryCategorySwaps)
        .where(eq(deliveryCategorySwaps.deliveryId, row.id)),
    ]);

    const applied: SwapRow[] = appliedRows
      .filter((r) => swapAppliesTo(r.forDate, row.deliveryDate, eatingDate))
      .map((r) => ({
        fromCategory: r.fromCategory,
        toCategory: r.toCategory,
        qtyFrom: r.qtyFrom,
        qtyTo: r.qtyTo,
      }));

    return computeAllSwapOptions({
      composition,
      applied,
      pairs,
      hideUnavailable: opts?.hideUnavailable ?? true,
    });
  });
}
