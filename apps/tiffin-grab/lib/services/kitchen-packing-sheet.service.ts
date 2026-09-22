// Daily Kitchen Packing Sheet: one delivery = one row. Columns are Item1…ItemN (not dish
// names). Each cell is "Dish — 12 OZ × 1" using existing TU → natural conversion via
// portionForPick. Kitchen Summary still aggregates by dish + portion across the day.
import { and, asc, eq, inArray } from "drizzle-orm";
import { parseIsoDateUtc } from "@foundry/commons";
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
import { coveredDates, occurrenceDates } from "@/lib/menu/coverage";
import { loadExtraDates } from "@/lib/services/delivery-extras";
import { fulfillmentReadyOrder } from "@/lib/orders/fulfillment";
import { resolveTripDay, swapsForDay, weekLoader } from "@/lib/menu/trip-meals";
import {
  addDishPortion,
  formatItemCell,
  type PackingItemLine,
} from "@/lib/menu/packing-requirement";
import { formatTuHuman } from "@/lib/menu/format-tu";
import { portionForPick, portionsByCategory, sumTuForPicks } from "@/lib/menu/pick-size";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type KitchenPackingRow = {
  deliveryPublicId: string;
  deliveryDate: string;
  /** Eating day of this row; carried days get their own row on the trip's delivery date. */
  forDate: string;
  /** "For Tue" on trips carrying several eating days, else null. */
  forLabel: string | null;
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
      deliveryDate: deliveries.deliveryDate,
      coversDates: deliveries.coversDates,
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
        fulfillmentReadyOrder(),
      ),
    )
    .orderBy(asc(deliveries.id));

  if (deliveryRows.length === 0) {
    return { dateIso, itemHeaders: [], rows: [], summary: [] };
  }

  const categories = await dishCategoriesService.forPlanType("tiffin");
  const categorySort = new Map(categories.map((c) => [c.key, c.sortOrder]));

  const loadWeek = weekLoader();

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
        forDate: deliveryCategorySwaps.forDate,
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
    forDate: string;
    forLabel: string | null;
    customerName: string;
    orderId: string;
    planName: string;
    mealSizeName: string;
    lines: PackingItemLine[];
  }[] = [];

  const extrasById = await loadExtraDates(db, deliveryRows.map((r) => r.deliveryId));
  for (const row of deliveryRows) {
    const covered = coveredDates({ deliveryDate: row.deliveryDate, coversDates: row.coversDates });
    // A day a moved-in tiffin doubled up on repeats here — one pass per physical tiffin, not per date.
    const occurrences = occurrenceDates({ deliveryDate: row.deliveryDate, coversDates: row.coversDates }, extrasById.get(row.deliveryId));
    for (const forDate of occurrences) {
    // Slot key → line. Selectable picks keep pickIndex so sabzi 12oz and 8oz stay separate.
    const lineBySlot = new Map<string, PackingItemLine>();
    const portions = portionsByCategory(
      sizeItems.filter((i) => i.mealSizeId === row.mealSizeId),
      tuByKey,
      swapsForDay(swapRows, { id: row.deliveryId, deliveryDate: row.deliveryDate }, forDate),
    );

    const week = await loadWeek(forDate);
    if (week) {
      for (let person = 1; person <= row.persons; person++) {
        const resolved = await resolveTripDay(
          { id: row.orderId, planId: row.planId, mealSizeId: row.mealSizeId, categoryCounts: row.categoryCounts },
          week,
          forDate,
          person,
          swapsForDay(swapRows, { id: row.deliveryId, deliveryDate: row.deliveryDate }, forDate),
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
      forDate,
      forLabel: covered.length > 1 ? `For ${DAY_NAMES[parseIsoDateUtc(forDate).getUTCDay()]}` : null,
      customerName: (row.fullName ?? "").trim() || "Customer",
      orderId: row.deploymentId,
      planName: row.planName,
      mealSizeName: row.mealSizeName,
      lines,
    });
    }
  }

  const maxItems = rowAcc.reduce((n, r) => Math.max(n, r.lines.length), 0);
  const itemHeaders = Array.from({ length: maxItems }, (_, i) => `Item${i + 1}`);

  const rows: KitchenPackingRow[] = rowAcc
    .map((r) => ({
      deliveryPublicId: r.deliveryPublicId,
      deliveryDate: dateIso,
      forDate: r.forDate,
      forLabel: r.forLabel,
      customerName: r.customerName,
      orderId: r.orderId,
      planName: r.planName,
      mealSizeName: r.mealSizeName,
      items: r.lines.map((line) => formatItemCell(line)),
    }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName) || a.forDate.localeCompare(b.forDate));

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
