import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { orderAddons, orders } from "@/db/schema";

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
  // Picks follow the order's own plan (diet).
  planId: bigint;
  maxTuAmount: null;
  addon: true;
};

export async function addonItemsByOrder(orderIds: bigint[]): Promise<Map<bigint, AddonItemRow[]>> {
  const out = new Map<bigint, AddonItemRow[]>();
  if (orderIds.length === 0) return out;
  const rows = await db
    .select({ orderId: orderAddons.orderId, category: orderAddons.category, tuAmount: orderAddons.tuAmount, qty: orderAddons.qty, planId: orders.planId })
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
  addons: { key: string; name: string; category: string; tuAmount: number; pricePerTiffin: number; qty: number }[],
  tiffinCount: number,
  organizationId: string | null,
) {
  return addons.map((a) => ({
    orderId,
    addonKey: a.key,
    addonName: a.name,
    category: a.category,
    tuAmount: a.tuAmount.toFixed(2),
    pricePerTiffin: a.pricePerTiffin.toFixed(2),
    qty: a.qty,
    amount: (Math.round((a.pricePerTiffin * a.qty * tiffinCount + Number.EPSILON) * 100) / 100).toFixed(2),
    organizationId,
  }));
}
