// Daily Kitchen Packing Sheet: one delivery = one row. Columns are Item1…ItemN (not dish
// names). Each cell is "Dish — 12 OZ × 1" using existing TU → natural conversion via
// portionForPick. Kitchen Summary still aggregates by dish + portion across the day.
import { and, asc, eq, inArray } from "drizzle-orm";
import { parseIsoDateUtc } from "@foundry/commons";
import { db } from "@/db/client";
import {
  deliveries,
  deliveryCategorySwaps,
  deliveryMoves,
  dishCategories,
  mealSizeItems,
  mealSizes,
  orders,
  plans,
  users,
} from "@/db/schema";
import { coveredDates, occurrenceDates } from "@/lib/menu/coverage";
import { loadExtraDates } from "@/lib/services/delivery-extras";
import { fulfillmentReadyOrder } from "@/lib/orders/fulfillment";
import { resolveTripDay, swapsForDay, weekLoader } from "@/lib/menu/trip-meals";
import { createMealResolveCache } from "@/lib/menu/resolve-delivery-meal";
import {
  addDishPortion,
  countPackNaturalTotal,
  countPackSlotPortions,
  formatItemCell,
  type PackingItemLine,
} from "@/lib/menu/packing-requirement";
import { isContainerCategory } from "@/lib/menu/format-tu";
import { portionForPick, portionsByCategory, slotTuAfterSwaps } from "@/lib/menu/pick-size";
import { addonItemsByOrder, addonPickIndexes } from "@/lib/menu/order-addon-items";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { withConcurrency } from "@/lib/concurrency";

// Under the pool size (10) so the other loaders on the labels page still get connections.
const ROW_CONCURRENCY = 6;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** NULL from date = a pooled tiffin scheduled onto this trip; undefined = no move row found. */
export function extraTiffinLabel(fromEatDate: string | null | undefined): string {
  if (fromEatDate === undefined) return "Extra";
  if (fromEatDate === null) return "Extra · from pool";
  const day = parseIsoDateUtc(fromEatDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return `Extra · moved from ${day}`;
}

export type KitchenPackingRow = {
  deliveryPublicId: string;
  deliveryDate: string;
  /** Eating day of this row; carried days get their own row on the trip's delivery date. */
  forDate: string;
  /** "For Tue" on trips carrying several eating days, "Extra · moved from Wed, Oct 7" on a moved-in repeat tiffin, else null. */
  forLabel: string | null;
  customerName: string;
  phone: string | null;
  /** OptimoRoute driver name after a route pull; serial alone when name is missing. */
  routeDriver: string | null;
  routeStopNumber: number | null;
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
      customerPhone: users.phone,
      routeDriverSerial: deliveries.routeDriverSerial,
      routeDriverName: deliveries.routeDriverName,
      routeStopNumber: deliveries.routeStopNumber,
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
    .leftJoin(users, eq(orders.userId, users.id))
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
        selectable: dishCategories.selectable,
      })
      .from(dishCategories),
    db
      .select({
        deliveryId: deliveryCategorySwaps.deliveryId,
        forDate: deliveryCategorySwaps.forDate,
        fromCategory: deliveryCategorySwaps.fromCategory,
        toCategory: deliveryCategorySwaps.toCategory,
        qtyFrom: deliveryCategorySwaps.qtyFrom,
        qtyTo: deliveryCategorySwaps.qtyTo, fromRow: deliveryCategorySwaps.fromRow, receiveTu: deliveryCategorySwaps.receiveTu,
      })
      .from(deliveryCategorySwaps)
      .where(inArray(deliveryCategorySwaps.deliveryId, deliveryRows.map((r) => r.deliveryId)))
      .orderBy(asc(deliveryCategorySwaps.id)),
  ]);

  const tuByKey = new Map(
    tuRows.map((c) => [
      c.key,
      { tuUnitType: c.tuUnitType, tuUnitSize: Number(c.tuUnitSize), tuUnitLabel: c.tuUnitLabel, selectable: c.selectable },
    ]),
  );
  // The meal size's rows, then the order's add-on rows (extra sabzi, roti…) packed in every tiffin.
  const addonsByOrder = await addonItemsByOrder(deliveryRows.map((r) => r.orderId));
  const itemsFor = (r: { orderId: bigint; mealSizeId: bigint }) => [
    ...sizeItems.filter((i) => i.mealSizeId === r.mealSizeId),
    ...(addonsByOrder.get(r.orderId) ?? []),
  ];

  const dayDishTotals = new Map<string, Map<string, number>>();
  const rowAcc: {
    deliveryPublicId: string;
    forDate: string;
    forLabel: string | null;
    customerName: string;
    phone: string | null;
    routeDriver: string | null;
    routeStopNumber: number | null;
    orderId: string;
    planName: string;
    mealSizeName: string;
    lines: PackingItemLine[];
  }[] = [];

  const extrasById = await loadExtraDates(db, deliveryRows.map((r) => r.deliveryId));
  const movesInById = new Map<bigint, { toEatDate: string; fromEatDate: string | null }[]>();
  if (deliveryRows.length) {
    const moves = await db
      .select({ deliveryId: deliveryMoves.toDeliveryId, toEatDate: deliveryMoves.toEatDate, fromEatDate: deliveryMoves.fromEatDate })
      .from(deliveryMoves)
      .where(inArray(deliveryMoves.toDeliveryId, deliveryRows.map((r) => r.deliveryId)))
      .orderBy(asc(deliveryMoves.id));
    for (const m of moves) (movesInById.get(m.deliveryId) ?? movesInById.set(m.deliveryId, []).get(m.deliveryId)!).push(m);
  }
  const mealCache = createMealResolveCache(addonsByOrder);
  // Rows are independent and each resolves its meal with several queries; run them
  // side by side instead of ~2 queries × every tiffin back to back. Output is sorted below.
  await withConcurrency(deliveryRows, async (row) => {
    const covered = coveredDates({ deliveryDate: row.deliveryDate, coversDates: row.coversDates });
    // A day a moved-in tiffin doubled up on repeats here — one pass per physical tiffin, not per date.
    const occurrences = occurrenceDates({ deliveryDate: row.deliveryDate, coversDates: row.coversDates }, extrasById.get(row.deliveryId));
    const seenByDate = new Map<string, number>();
    for (const forDate of occurrences) {
    // Second+ tiffin for the same eating day: name it so staff don't read it as a duplicate.
    const nth = seenByDate.get(forDate) ?? 0;
    seenByDate.set(forDate, nth + 1);
    const extraLabel = nth === 0 ? null : extraTiffinLabel(
      (movesInById.get(row.deliveryId) ?? []).filter((m) => m.toEatDate === forDate)[nth - 1]?.fromEatDate,
    );
    // Slot key → line. Selectable picks keep pickIndex so sabzi 12oz and 8oz stay separate.
    const lineBySlot = new Map<string, PackingItemLine>();
    const portions = portionsByCategory(
      itemsFor(row),
      tuByKey,
      swapsForDay(swapRows, { id: row.deliveryId, deliveryDate: row.deliveryDate }, forDate),
    );
    // Add-on rows (extra sabzi…) are marked so the packer sees what's extra in the tiffin.
    const addonPicks = addonPickIndexes(itemsFor(row), swapsForDay(swapRows, { id: row.deliveryId, deliveryDate: row.deliveryDate }, forDate), tuByKey);

    const week = await loadWeek(forDate);
    if (week) {
      for (let person = 1; person <= row.persons; person++) {
        const resolved = await resolveTripDay(
          { id: row.orderId, planId: row.planId, mealSizeId: row.mealSizeId, categoryCounts: row.categoryCounts },
          week,
          forDate,
          person,
          swapsForDay(swapRows, { id: row.deliveryId, deliveryDate: row.deliveryDate }, forDate),
          mealCache,
        );
        const ordered = [...resolved].sort(
          (a, b) => (categorySort.get(a.category) ?? 0) - (categorySort.get(b.category) ?? 0),
        );
        for (const cat of ordered) {
          if (cat.picks.length === 0) continue;
          const converter = tuByKey.get(cat.category);
          if (isContainerCategory(converter) || cat.selectable) {
            cat.picks.forEach((pick, i) => {
              const pickIndex = i + 1;
              const portion = (portionForPick(portions, cat.category, pickIndex) ?? "").trim();
              if (!portion) return;
              const slotKey = `${cat.category}:${pickIndex}`;
              addOrBumpLine(
                lineBySlot,
                slotKey,
                addonPicks.get(cat.category)?.has(pickIndex) ? `${pick.name} (add-on)` : pick.name,
                portion,
                1,
                (categorySort.get(cat.category) ?? 0) * 100 + pickIndex,
              );
              addDishPortion(dayDishTotals, pick.name, portion, 1);
            });
          } else {
            // Count (roti/rice): pack size × pack count → plain total ("4 roti" × 2 → "8 rotis").
            // Emit one pack per composition slot; identical sizes merge on ×; never show × in the cell.
            const daySwaps = swapsForDay(swapRows, { id: row.deliveryId, deliveryDate: row.deliveryDate }, forDate);
            const pick = cat.picks[0]!;
            const mealItems = itemsFor(row);
            const slots = slotTuAfterSwaps(mealItems, daySwaps, tuByKey).get(cat.category) ?? [];
            const slotKey = `${cat.category}:fixed`;
            const sort = (categorySort.get(cat.category) ?? 0) * 100;
            const countWord = (cat.label || cat.category).trim().toLowerCase() || "unit";
            if (converter) {
              const wrapSlots = daySwaps.length === 0;
              for (const packPortion of countPackSlotPortions(slots, cat.quantity, converter, wrapSlots)) {
                addOrBumpLine(lineBySlot, slotKey, pick.name, packPortion, 1, sort, "count-total", countWord);
              }
              const natural = countPackNaturalTotal(slots, cat.quantity, converter, wrapSlots);
              if (natural > 0) addDishPortion(dayDishTotals, pick.name, countWord, natural);
            } else {
              const portion = (portionForPick(portions, cat.category, 1) ?? "").trim();
              if (!portion) continue;
              addOrBumpLine(lineBySlot, slotKey, pick.name, portion, 1, sort);
              addDishPortion(dayDishTotals, pick.name, portion, 1);
            }
          }
        }
      }
    }

    const lines = [...lineBySlot.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    rowAcc.push({
      deliveryPublicId: row.deliveryPublicId,
      forDate,
      forLabel: [covered.length > 1 ? `For ${DAY_NAMES[parseIsoDateUtc(forDate).getUTCDay()]}` : null, extraLabel]
        .filter(Boolean).join(" · ") || null,
      customerName: (row.fullName ?? "").trim() || "Customer",
      phone: row.customerPhone ?? null,
      routeDriver: row.routeDriverName ?? row.routeDriverSerial ?? null,
      routeStopNumber: row.routeStopNumber ?? null,
      orderId: row.deploymentId,
      planName: row.planName,
      mealSizeName: row.mealSizeName,
      lines,
    });
    }
  }, ROW_CONCURRENCY);

  const maxItems = rowAcc.reduce((n, r) => Math.max(n, r.lines.length), 0);
  const itemHeaders = Array.from({ length: maxItems }, (_, i) => `Item${i + 1}`);

  const rows: KitchenPackingRow[] = rowAcc
    .map((r) => ({
      deliveryPublicId: r.deliveryPublicId,
      deliveryDate: dateIso,
      forDate: r.forDate,
      forLabel: r.forLabel,
      customerName: r.customerName,
      phone: r.phone,
      routeDriver: r.routeDriver,
      routeStopNumber: r.routeStopNumber,
      orderId: r.orderId,
      planName: r.planName,
      mealSizeName: r.mealSizeName,
      items: r.lines.map((line) => formatItemCell(line)),
    }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName) || a.forDate.localeCompare(b.forDate) || a.orderId.localeCompare(b.orderId));

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
  packStyle?: PackingItemLine["packStyle"],
  countWord?: string,
): void {
  const same = (line: PackingItemLine) =>
    line.name === name && line.portion === portion && line.packStyle === packStyle && line.countWord === countWord;
  const hit = into.get(slotKey);
  if (hit && same(hit)) {
    hit.quantity += qty;
    return;
  }
  // Prefer merging any existing line with the same name+portion (persons stacking) before
  // creating a sibling — avoids duplicate Item columns for the same packing line.
  for (const line of into.values()) {
    if (same(line)) {
      line.quantity += qty;
      return;
    }
  }
  const next: PackingItemLine = {
    name,
    portion,
    quantity: qty,
    sort,
    ...(packStyle ? { packStyle } : {}),
    ...(countWord ? { countWord } : {}),
  };
  if (hit) {
    into.set(`${slotKey}:${into.size}`, { ...next, sort: sort + 0.01 });
    return;
  }
  into.set(slotKey, next);
}
