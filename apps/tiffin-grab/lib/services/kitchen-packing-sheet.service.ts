// Daily Kitchen Packing Sheet: one delivery = one row. Columns are Item1…ItemN (not dish
// names). Each cell is "Dish — 12 OZ × 1" using existing TU → natural conversion via
// portionForPick. Kitchen Summary still aggregates by dish + portion across the day.
import { and, asc, eq, inArray } from "drizzle-orm";
import { parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import { db } from "@/db/client";
import {
  deliveries,
  deliveryCategorySwaps,
  dishCategories,
  mealSizeItems,
  mealSizes,
  orders,
  plans,
} from "@/db/schema";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import {
  addDishPortion,
  formatItemCell,
  type PackingItemLine,
} from "@/lib/menu/packing-requirement";
import { formatTuHuman } from "@/lib/menu/format-tu";
import { portionForPick, portionsByCategory, sumTuForPicks } from "@/lib/menu/pick-size";
import { resolveDeliveryMeal } from "@/lib/menu/resolve-delivery-meal";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { menuService } from "@/lib/services/menu.service";

export type KitchenPackingRow = {
  deliveryPublicId: string;
  deliveryDate: string;
  customerName: string;
  orderId: string;
  planName: string;
  mealSizeName: string;
  /** Ordered packing lines — Excel Item1…ItemN cells. */
  items: string[];
};

export type KitchenSummaryLine = {
  dish: string;
  portion: string;
  totalQuantity: number;
};

export type KitchenPackingSheet = {
  dateIso: string;
  /** Item1…ItemN — count is max items on any order that day. */
  itemHeaders: string[];
  rows: KitchenPackingRow[];
  summary: KitchenSummaryLine[];
};

export async function getKitchenPackingSheet(dateIso: string): Promise<KitchenPackingSheet> {
  const deliveryRows = await db
    .select({
      deliveryId: deliveries.id,
      deliveryPublicId: deliveries.publicId,
      orderId: orders.id,
      deploymentId: orders.deploymentId,
      fullName: orders.fullName,
      persons: orders.persons,
      planId: orders.planId,
      mealSizeId: orders.mealSizeId,
      categoryCounts: orders.categoryCounts,
      planName: plans.name,
      mealSizeName: mealSizes.name,
    })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .where(
      and(
        eq(deliveries.deliveryDate, dateIso),
        eq(deliveries.status, "scheduled"),
        eq(plans.planType, "tiffin"),
      ),
    )
    .orderBy(asc(deliveries.id));

  if (deliveryRows.length === 0) {
    return { dateIso, itemHeaders: [], rows: [], summary: [] };
  }

  const categories = await dishCategoriesService.forPlanType("tiffin");
  const categorySort = new Map(categories.map((c) => [c.key, c.sortOrder]));

  const weekStart = mondayOfIso(dateIso);
  const week = await menuService.getReleasedWeek(weekStart);
  const dayOfWeek = weekdayKey(parseIsoDateUtc(dateIso));

  const [sizeItems, tuRows, swapRows] = await Promise.all([
    db
      .select({
        mealSizeId: mealSizeItems.mealSizeId,
        category: mealSizeItems.category,
        tuAmount: mealSizeItems.tuAmount,
        sortOrder: mealSizeItems.sortOrder,
      })
      .from(mealSizeItems)
      .where(inArray(mealSizeItems.mealSizeId, [...new Set(deliveryRows.map((r) => r.mealSizeId))])),
    db
      .select({
        key: dishCategories.key,
        tuUnitType: dishCategories.tuUnitType,
        tuUnitSize: dishCategories.tuUnitSize,
        tuUnitLabel: dishCategories.tuUnitLabel,
      })
      .from(dishCategories),
    db
      .select({
        deliveryId: deliveryCategorySwaps.deliveryId,
        fromCategory: deliveryCategorySwaps.fromCategory,
        toCategory: deliveryCategorySwaps.toCategory,
        qtyFrom: deliveryCategorySwaps.qtyFrom,
        qtyTo: deliveryCategorySwaps.qtyTo,
      })
      .from(deliveryCategorySwaps)
      .where(inArray(deliveryCategorySwaps.deliveryId, deliveryRows.map((r) => r.deliveryId)))
      .orderBy(asc(deliveryCategorySwaps.id)),
  ]);

  const tuByKey = new Map(
    tuRows.map((c) => [
      c.key,
      { tuUnitType: c.tuUnitType, tuUnitSize: Number(c.tuUnitSize), tuUnitLabel: c.tuUnitLabel },
    ]),
  );

  const dayDishTotals = new Map<string, Map<string, number>>();
  const rowAcc: {
    deliveryPublicId: string;
    customerName: string;
    orderId: string;
    planName: string;
    mealSizeName: string;
    lines: PackingItemLine[];
  }[] = [];

  for (const row of deliveryRows) {
    // Slot key → line. Selectable picks keep pickIndex so sabzi 12oz and 8oz stay separate.
    const lineBySlot = new Map<string, PackingItemLine>();
    const portions = portionsByCategory(
      sizeItems.filter((i) => i.mealSizeId === row.mealSizeId),
      tuByKey,
      swapRows.filter((s) => s.deliveryId === row.deliveryId),
    );

    if (week) {
      for (let person = 1; person <= row.persons; person++) {
        const resolved = await resolveDeliveryMeal(
          {
            id: row.orderId,
            planId: row.planId,
            mealSizeId: row.mealSizeId,
            categoryCounts: row.categoryCounts,
          },
          week,
          dayOfWeek,
          person,
          row.deliveryId,
        );
        const ordered = [...resolved].sort(
          (a, b) => (categorySort.get(a.category) ?? 0) - (categorySort.get(b.category) ?? 0),
        );
        for (const cat of ordered) {
          if (cat.picks.length === 0) continue;
          if (!cat.selectable) {
            // Non-selectable (roti/rice/…): one pick name, quantity = slot count. Do NOT loop
            // portionForPick(i) — meal_size may have one TU line for the whole count (or N
            // lines); missing indices used to invent "portion" and explode Item columns.
            const pick = cat.picks[0]!;
            const mealItems = sizeItems.filter((i) => i.mealSizeId === row.mealSizeId);
            const tuTotal = sumTuForPicks(mealItems, cat.category, cat.quantity);
            const converter = tuByKey.get(cat.category);
            const portion =
              converter && tuTotal > 0
                ? formatTuHuman(converter, tuTotal)
                : (portionForPick(portions, cat.category, 1) ?? "").trim();
            if (!portion) continue;
            const slotKey = `${cat.category}:fixed`;
            addOrBumpLine(
              lineBySlot,
              slotKey,
              pick.name,
              portion,
              1,
              categorySort.get(cat.category) ?? 0,
            );
            addDishPortion(dayDishTotals, pick.name, portion, 1);
          } else {
            cat.picks.forEach((pick, i) => {
              const pickIndex = i + 1;
              const portion = (portionForPick(portions, cat.category, pickIndex) ?? "").trim();
              if (!portion) return;
              const slotKey = `${cat.category}:${pickIndex}`;
              addOrBumpLine(
                lineBySlot,
                slotKey,
                pick.name,
                portion,
                1,
                (categorySort.get(cat.category) ?? 0) * 100 + pickIndex,
              );
              addDishPortion(dayDishTotals, pick.name, portion, 1);
            });
          }
        }
      }
    }

    const lines = [...lineBySlot.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    rowAcc.push({
      deliveryPublicId: row.deliveryPublicId,
      customerName: (row.fullName ?? "").trim() || "Customer",
      orderId: row.deploymentId,
      planName: row.planName,
      mealSizeName: row.mealSizeName,
      lines,
    });
  }

  const maxItems = rowAcc.reduce((n, r) => Math.max(n, r.lines.length), 0);
  const itemHeaders = Array.from({ length: maxItems }, (_, i) => `Item${i + 1}`);

  const rows: KitchenPackingRow[] = rowAcc
    .map((r) => ({
      deliveryPublicId: r.deliveryPublicId,
      deliveryDate: dateIso,
      customerName: r.customerName,
      orderId: r.orderId,
      planName: r.planName,
      mealSizeName: r.mealSizeName,
      items: r.lines.map((line) => formatItemCell(line)),
    }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName));

  const summary: KitchenSummaryLine[] = [];
  for (const dish of [...dayDishTotals.keys()].sort((a, b) => a.localeCompare(b))) {
    const byPortion = dayDishTotals.get(dish)!;
    for (const [portion, totalQuantity] of [...byPortion.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      summary.push({ dish, portion, totalQuantity });
    }
  }

  return { dateIso, itemHeaders, rows, summary };
}

function addOrBumpLine(
  into: Map<string, PackingItemLine>,
  slotKey: string,
  name: string,
  portion: string,
  qty: number,
  sort: number,
): void {
  const hit = into.get(slotKey);
  if (hit && hit.portion === portion && hit.name === name) {
    hit.quantity += qty;
    return;
  }
  // Prefer merging any existing line with the same name+portion (persons stacking) before
  // creating a sibling — avoids duplicate Item columns for the same packing line.
  for (const line of into.values()) {
    if (line.name === name && line.portion === portion) {
      line.quantity += qty;
      return;
    }
  }
  if (hit) {
    into.set(`${slotKey}:${into.size}`, { name, portion, quantity: qty, sort: sort + 0.01 });
    return;
  }
  into.set(slotKey, { name, portion, quantity: qty, sort });
}
