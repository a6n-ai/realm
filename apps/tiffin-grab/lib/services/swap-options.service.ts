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
import { categoryCountsFromItems } from "@/lib/menu/pick-size";
import { addonItemsForOrder, countsWithoutAddons } from "@/lib/menu/order-addon-items";
import type { SwapRow } from "@/lib/menu/swap-rules";
import { assertMutable, loadByPublicId, loadOrderIdByPublicId } from "./deliveries.service";
import { dishCategoriesService } from "./dish-categories.service";

/**
 * Swap composition for an order's meal: only the meal size's own rows. Add-on rows (extra sabzi, roti…)
 * never enter it, so no swap can take an add-on. `orderId` strips add-ons from the stored-counts fallback.
 */
export async function loadCompositionContext(mealSizeId: bigint, baseCounts: Record<string, number>, orderId?: bigint): Promise<CompositionContext> {
  const [cats, items, labels, addons] = await Promise.all([
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
    orderId != null ? addonItemsForOrder(orderId) : Promise.resolve([]),
  ]);
  const mealSizeItemRows: MealSizeItemRow[] = items.map((i) => ({
    category: i.category,
    tuAmount: Number(i.tuAmount),
    maxTuAmount: i.maxTuAmount == null ? null : Number(i.maxTuAmount),
    sortOrder: i.sortOrder,
  }));
  const labelMap: Record<string, string> = {};
  for (const l of labels) labelMap[l.key] = l.label;
  const effectiveBaseCounts = items.length > 0 ? categoryCountsFromItems(items) : countsWithoutAddons(baseCounts, addons);
  return { baseCounts: effectiveBaseCounts, mealSizeItems: mealSizeItemRows, categories: cats, labels: labelMap };
}

export async function listValidSwapOptionsForDelivery(
  deliveryPublicId: string,
  opts?: { 
    forDate?: string; 
    hideUnavailable?: boolean;
    provisionalSwaps?: { fromCategory: string; toCategory: string; qtyFrom: number; qtyTo: number; fromRow?: number | null; receiveTu?: number | null }[];
    omitSwapPublicIds?: string[];
  },
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
      loadCompositionContext(order.mealSizeId, order.categoryCounts ?? {}, order.id),
      dishCategoriesService.swapPairsForMealSize(order.mealSizeId),
      tx
        .select({
          publicId: deliveryCategorySwaps.publicId,
          fromCategory: deliveryCategorySwaps.fromCategory,
          toCategory: deliveryCategorySwaps.toCategory,
          qtyFrom: deliveryCategorySwaps.qtyFrom,
          qtyTo: deliveryCategorySwaps.qtyTo, fromRow: deliveryCategorySwaps.fromRow, receiveTu: deliveryCategorySwaps.receiveTu,
          forDate: deliveryCategorySwaps.forDate,
        })
        .from(deliveryCategorySwaps)
        .where(eq(deliveryCategorySwaps.deliveryId, row.id)).orderBy(asc(deliveryCategorySwaps.id)),
    ]);

    const omit = new Set(opts?.omitSwapPublicIds ?? []);
    const applied: SwapRow[] = appliedRows
      .filter((r) => !omit.has(r.publicId) && swapAppliesTo(r.forDate, row.deliveryDate, eatingDate))
      .map((r) => ({
        fromCategory: r.fromCategory,
        toCategory: r.toCategory,
        qtyFrom: r.qtyFrom,
        qtyTo: r.qtyTo,
        fromRow: r.fromRow,
        receiveTu: r.receiveTu,
      }));

    if (opts?.provisionalSwaps) {
      for (const p of opts.provisionalSwaps) {
        if (p.qtyFrom > 0) {
          applied.push({
            fromCategory: p.fromCategory,
            toCategory: p.toCategory,
            qtyFrom: p.qtyFrom,
            qtyTo: p.qtyTo,
            fromRow: p.fromRow ?? null,
            receiveTu: p.receiveTu ?? null,
          });
        }
      }
    }

    return computeAllSwapOptions({
      composition,
      applied,
      pairs,
      hideUnavailable: opts?.hideUnavailable ?? true,
    });
  });
}
