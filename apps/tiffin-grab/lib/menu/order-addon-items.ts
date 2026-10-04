import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orderAddons, orders, plans } from "@/db/schema";
import { slotRowsAfterSwaps, type MealSizeItemRow, type PortionSwap } from "./pick-size";
import type { TuCategory } from "./format-tu";

/**
 * Catalog add-ons as extra rows in every tiffin. Each qty of an order's add-on is one
 * more row of its dish category at its own TU, appended after the meal size's own rows
 * (sortOrder above any real item). Picks, portions, kitchen and labels read these rows
 * alongside meal_size_items; swaps never do — swap-options reads meal_size_items only,
 * and appending keeps every swap's fromRow pointing at the same meal row.
 */
export const ADDON_SORT_BASE = 100_000;

export type AddonItemRow = {
  category: string;
  tuAmount: string;
  sortOrder: number;
  // Picks follow the add-on's own plan when set ("Veg Sabzi"), else the order's.
  planId: bigint;
  maxTuAmount: null;
  addon: true;
};

export async function addonItemsByOrder(orderIds: bigint[]): Promise<Map<bigint, AddonItemRow[]>> {
  const out = new Map<bigint, AddonItemRow[]>();
  if (orderIds.length === 0) return out;
  const rows = await db
    .select({ orderId: orderAddons.orderId, category: orderAddons.category, tuAmount: orderAddons.tuAmount, qty: orderAddons.qty, planId: sql<bigint>`coalesce(${orderAddons.planId}, ${orders.planId})`.mapWith(BigInt) })
    .from(orderAddons)
    .innerJoin(orders, eq(orders.id, orderAddons.orderId))
    .where(inArray(orderAddons.orderId, [...new Set(orderIds)]))
    .orderBy(orderAddons.id);
  for (const r of rows) {
    const list = out.get(r.orderId) ?? [];
    for (let i = 0; i < r.qty; i++) {
      list.push({ category: r.category, tuAmount: r.tuAmount, sortOrder: ADDON_SORT_BASE + list.length, planId: r.planId, maxTuAmount: null, addon: true });
    }
    out.set(r.orderId, list);
  }
  return out;
}

export async function addonItemsForOrder(orderId: bigint): Promise<AddonItemRow[]> {
  return (await addonItemsByOrder([orderId])).get(orderId) ?? [];
}

/** The meal size's category counts plus one per add-on qty — what order.categoryCounts stores. */
export function countsWithAddons(base: Record<string, number>, addons: { category: string; qty: number }[]): Record<string, number> {
  const out = { ...base };
  for (const a of addons) out[a.category] = (out[a.category] ?? 0) + a.qty;
  return out;
}

/** order_addons rows for a priced order: the snapshot of what each tiffin carries and costs. */
export function orderAddonValues(
  orderId: bigint,
  addons: { key: string; name: string; category: string; planKey?: string | null; tuAmount: number; pricePerTiffin: number; qty: number }[],
  tiffinCount: number,
  organizationId: string | null,
) {
  return addons.map((a) => ({
    orderId,
    addonKey: a.key,
    addonName: a.name,
    category: a.category,
    planId: a.planKey ? sql<bigint>`(select ${plans.id} from ${plans} where ${plans.key} = ${a.planKey})` : null,
    tuAmount: a.tuAmount.toFixed(2),
    pricePerTiffin: a.pricePerTiffin.toFixed(2),
    qty: a.qty,
    amount: (Math.round((a.pricePerTiffin * a.qty * tiffinCount + Number.EPSILON) * 100) / 100).toFixed(2),
    organizationId,
  }));
}

/**
 * Which picks (1-based, per category) are add-on rows once the day's swaps are folded in.
 * slotRowsAfterSwaps keeps each slot's source row, so a slot is an add-on exactly when its
 * source row is one — whatever swaps gave away or brought in around it.
 */
export function addonPickIndexes(
  items: (MealSizeItemRow & { addon?: true })[],
  swaps: PortionSwap[],
  categoriesByKey?: Map<string, TuCategory>,
): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  if (!items.some((i) => i.addon)) return out;
  for (const [category, slots] of slotRowsAfterSwaps(items, swaps, categoriesByKey)) {
    const sorted = items.filter((i) => i.category === category).sort((a, b) => a.sortOrder - b.sortOrder);
    slots.forEach((slot, i) => {
      if (slot.row != null && sorted[slot.row]?.addon) {
        const set = out.get(category) ?? new Set<number>();
        set.add(i + 1);
        out.set(category, set);
      }
    });
  }
  return out;
}
