// One day, every subscription: the labels that go on the containers and the counts the
// kitchen cooks from. Replaces the Label Maker spreadsheet's Export Sheet1 + Count Items.
//
// Every read of "what does this subscriber receive" goes through resolveDeliveryMeal —
// re-deriving the pick → default fallback here would let the label disagree with what the
// customer sees on their calendar, which is the one failure this must not have.
import { loadMealSizeItems } from "@/lib/menu/meal-size-items";
import { loadDayDeliveries, STATUS_DAY_STATUSES, toStatusRows, type DayDeliveryRow, type DayDeliveryStatusRow } from "@/lib/deliveries/day-deliveries";
import { asc, inArray, isNotNull } from "drizzle-orm";
import { parseIsoDateUtc } from "@foundry/commons";
import { db } from "@/db/client";
import {
  deliveryCategorySwaps,
  deliveryZones,
  dishCategories,
  dishes,
} from "@/db/schema";
import { effectiveAddress } from "@/lib/deliveries/row-state";
import { menuService } from "@/lib/menu/menu.service";
import { coveredDates, occurrenceDates } from "@/lib/deliveries/schedule/coverage";
import { extraTiffinLabelAt, loadExtraDates, loadMovesIn } from "@/lib/deliveries/delivery-extras";
import { packLines } from "@/lib/menu/packing-requirement";
import { isCountCategory } from "@/lib/menu/format-tu";
import { resolveTripDay, swapsForDay, weekLoader } from "@/lib/menu/trip-meals";
import { createMealResolveCache } from "@/lib/menu/resolve-delivery-meal";
import { portionForPick, portionsByCategory } from "@/lib/menu/pick-size";
import { addonItemsByOrder, addonPickIndexes } from "@/lib/menu/order-addon-items";
import { withConcurrency } from "@foundry/commons/util/concurrency";
import { DAY_NAMES, mondayOfIso } from "@foundry/commons/util/dates";

// Under the pool size (10) so the other loaders on the labels page still get connections.
const ROW_CONCURRENCY = 6;

export type LabelLine = {
  category: string;
  categoryLabel: string;
  dish: string;
  /**
   * The dish's own category when it differs from the slot (Kali Dal picked as a Sabzi side).
   * Kitchen counts group by this — the kitchen cooks the dish, not the slot.
   */
  dishCategory?: { key: string; label: string };
  /** "8oz" — null when the meal size carries no weight for that slot. */
  portion: string | null;
  /** True when the customer never picked and the menu default was used. */
  defaulted: boolean;
  /** An add-on row (extra sabzi…); labels mark it, kitchen counts don't split on it. */
  addon?: boolean;
  /** Count category (roti, rice, weekend dish): portion is the box total ("8 roti"), add-ons folded in (packLines). */
  count?: boolean;
};

export type DeliveryLabel = {
  deliveryPublicId: string;
  orderPublicId: string;
  deploymentId: string;
  customerName: string;
  phone: string | null;
  addressUnit: string | null;
  addressLine: string;
  city: string;
  postalCode: string;
  zoneName: string | null;
  /** From the OptimoRoute pull. Null until routes are planned and pulled for that date. */
  routeDriver: string | null;
  routeStop: number | null;
  planName: string;
  mealSizeName: string;
  /** 1-based; an order for 2 people prints 2 labels, as the kitchen packs 2 tiffins. */
  personIndex: number;
  persons: number;
  /** The eating day this label is for. Equals the sheet date unless the trip carries later days. */
  forDate: string;
  /** "For Tue" on trips carrying several eating days, "Extra · Oct 7" on a moved-in repeat tiffin, else null. */
  forLabel: string | null;
  deliveryNotes: string | null;
  lines: LabelLine[];
};

/** One row per dish+portion — the "(Main Veg) 8oz Count: 61" line from the sheet. */
export type KitchenCount = {
  category: string;
  categoryLabel: string;
  dish: string;
  portion: string | null;
  count: number;
};

export type DailyLabelSheet = {
  date: string;
  weekStart: string;
  /** Null when no menu week is released for that date — labels cannot be resolved. */
  menuWeekPublicId: string | null;
  labels: DeliveryLabel[];
  counts: KitchenCount[];
  /**
   * Labels per delivery group. Once routes are pulled this is the driver — the real
   * loading order; before that it falls back to delivery zone.
   */
  byRoute: { group: string; labels: number; planned: boolean }[];
};

const EMPTY = (date: string, weekStart: string): DailyLabelSheet => ({
  date,
  weekStart,
  menuWeekPublicId: null,
  labels: [],
  counts: [],
  byRoute: [],
});

const UNZONED = "Unzoned";
/**
 * The Overview "Today's service" card: every delivery's status, plus labels per meal size counted
 * the way `dailyLabelSheet` prints them (one per eating day per person, scheduled only, none until
 * the week is released) without resolving any dishes. One delivery load instead of two, and no
 * per-row menu lookups.
 */
export async function dayServiceSummary(dateIso: string): Promise<{ rows: DayDeliveryStatusRow[]; labelsByMealSize: Map<string, number> }> {
  const [rows, week] = await Promise.all([loadDayDeliveries(dateIso, STATUS_DAY_STATUSES), menuService.getReleasedWeek(mondayOfIso(dateIso))]);
  const labelsByMealSize = new Map<string, number>();
  const scheduled = week ? rows.filter((r) => r.delivery.status === "scheduled") : [];
  if (scheduled.length) {
    const extrasById = await loadExtraDates(db, scheduled.map((r) => r.delivery.id));
    for (const { delivery, order, mealSizeName } of scheduled) {
      const labels = occurrenceDates(delivery, extrasById.get(delivery.id)).length * order.persons;
      labelsByMealSize.set(mealSizeName, (labelsByMealSize.get(mealSizeName) ?? 0) + labels);
    }
  }
  return { rows: toStatusRows(rows, Date.now()), labelsByMealSize };
}

export async function dailyLabelSheet(dateIso: string): Promise<DailyLabelSheet> {
  const weekStart = mondayOfIso(dateIso);
  const loadWeek = weekLoader();

  // Exact-match released week, same gate as the customer calendar — never a fallback week,
  // or the kitchen packs a menu nobody was shown.
  const week = await menuService.getReleasedWeek(weekStart);
  if (!week) return EMPTY(dateIso, weekStart);

  const rows = await loadDayDeliveries(dateIso);

  if (rows.length === 0) return { ...EMPTY(dateIso, weekStart), menuWeekPublicId: week.publicId };

  const [zones, sizeItems, categories] = await Promise.all([
    db.select({ id: deliveryZones.id, name: deliveryZones.name }).from(deliveryZones),
    loadMealSizeItems([...new Set(rows.map((r) => r.order.mealSizeId))]),
    db
      .select({
        key: dishCategories.key,
        tuUnitType: dishCategories.tuUnitType,
        tuUnitSize: dishCategories.tuUnitSize,
        tuUnitLabel: dishCategories.tuUnitLabel,
        selectable: dishCategories.selectable,
        label: dishCategories.label,
      })
      .from(dishCategories),
  ]);
  const dishHome = await dishCategoryByDish(categories);

  const swapRows =
    rows.length === 0
      ? []
      : await db
          .select({
            deliveryId: deliveryCategorySwaps.deliveryId,
            forDate: deliveryCategorySwaps.forDate,
            fromCategory: deliveryCategorySwaps.fromCategory,
            toCategory: deliveryCategorySwaps.toCategory,
            qtyFrom: deliveryCategorySwaps.qtyFrom,
            qtyTo: deliveryCategorySwaps.qtyTo, fromRow: deliveryCategorySwaps.fromRow, receiveTu: deliveryCategorySwaps.receiveTu,
          })
          .from(deliveryCategorySwaps)
          .where(inArray(deliveryCategorySwaps.deliveryId, rows.map((r) => r.delivery.id)))
          .orderBy(asc(deliveryCategorySwaps.id));

  const zoneName = new Map(zones.map((z) => [z.id, z.name]));
  const categoriesByKey = new Map(
    categories.map((c) => [c.key, { tuUnitType: c.tuUnitType, tuUnitSize: Number(c.tuUnitSize), tuUnitLabel: c.tuUnitLabel, selectable: c.selectable }]),
  );
  // Per delivery and eating day, not per meal size: two orders on the same size differ once
  // one of them has a swap applied, and a carried day only gets its own for_date swaps.
  // The meal size's rows, then the order's add-on rows packed in every tiffin.
  const addonsByOrder = await addonItemsByOrder(rows.map((r) => r.order.id));
  const itemsFor = (r: DayDeliveryRow) => [
    ...sizeItems.filter((i) => i.mealSizeId === r.order.mealSizeId),
    ...(addonsByOrder.get(r.order.id) ?? []),
  ];
  const portionsFor = (r: DayDeliveryRow, date: string) =>
    portionsByCategory(itemsFor(r), categoriesByKey, swapsForDay(swapRows, r.delivery, date));

  const extrasById = await loadExtraDates(db, rows.map((r) => r.delivery.id));
  const movesInById = await loadMovesIn(db, rows.map((r) => r.delivery.id));
  const mealCache = createMealResolveCache(addonsByOrder);
  const labels: DeliveryLabel[] = [];
  // Rows are independent; resolve them side by side (sortForPrinting fixes the order).
  await withConcurrency(rows, async (row) => {
    const { delivery, order } = row;
    const address = effectiveAddress(delivery, order);
    const covered = coveredDates(delivery);
    // A day a moved-in tiffin doubled up on repeats here — one label set per physical tiffin, not per date.
    const occurrences = occurrenceDates(delivery, extrasById.get(delivery.id));

    // One label per covered occurrence per person: the kitchen packs every carried meal for the
    // trip's delivery date, each tagged with the day it is eaten.
    const seenByDate = new Map<string, number>();
    for (const forDate of occurrences) {
    // Second+ tiffin for one eating day gets the same "Extra · Nov 6" tag as the packing sheet.
    const nth = seenByDate.get(forDate) ?? 0;
    seenByDate.set(forDate, nth + 1);
    const extraLabel = extraTiffinLabelAt(movesInById.get(delivery.id), forDate, nth);
    for (let person = 1; person <= order.persons; person++) {
      const dayWeek = forDate === dateIso ? week : await loadWeek(forDate);
      const portions = portionsFor(row, forDate);
      const resolved = dayWeek
        ? await resolveTripDay(order, dayWeek, forDate, person, swapsForDay(swapRows, delivery, forDate), mealCache)
        : [];
      const lines: LabelLine[] = [];
      const addonPicks = addonPickIndexes(itemsFor(row), swapsForDay(swapRows, delivery, forDate), categoriesByKey);
      for (const category of resolved) {
        category.picks.forEach((pick, i) => {
          lines.push({
            category: category.category,
            categoryLabel: category.label,
            dish: pick.name,
            dishCategory: dishHome.get(pick.dishId)?.key === category.category ? undefined : dishHome.get(pick.dishId),
            addon: addonPicks.get(category.category)?.has(i + 1) || undefined,
            portion: portionForPick(portions, category.category, i + 1),
            defaulted: pick.isDefaulted,
            count: isCountCategory(categoriesByKey.get(category.category)) || undefined,
          });
        });
      }

      labels.push({
        deliveryPublicId: delivery.publicId,
        orderPublicId: order.publicId,
        deploymentId: order.deploymentId,
        customerName: address.fullName,
        phone: row.customerPhone ?? null,
        addressUnit: address.addressUnit,
        addressLine: address.addressLine,
        city: address.city,
        postalCode: address.postalCode,
        zoneName: address.zoneId != null ? zoneName.get(address.zoneId) ?? null : null,
        routeDriver: delivery.routeDriverName ?? delivery.routeDriverSerial ?? null,
        routeStop: delivery.routeStopNumber,
        planName: row.planName,
        mealSizeName: row.mealSizeName,
        personIndex: person,
        persons: order.persons,
        forDate,
        forLabel: [covered.length > 1 ? `For ${DAY_NAMES[parseIsoDateUtc(forDate).getUTCDay()]}` : null, extraLabel]
          .filter(Boolean).join(" · ") || null,
        deliveryNotes: row.driverNote,
        lines: packLines(lines),
      });
    }
    }
  }, ROW_CONCURRENCY);

  return {
    date: dateIso,
    weekStart,
    menuWeekPublicId: week.publicId,
    labels: sortForPrinting(labels),
    counts: countBy(labels),
    byRoute: routeTotals(labels),
  };
}

/** dish id → its own category (key + label); dishes with no category are left out. */
async function dishCategoryByDish(categories: { key: string; label: string }[]) {
  const labelOf = new Map(categories.map((c) => [c.key, c.label]));
  const rows = await db.select({ id: dishes.id, category: dishes.category }).from(dishes).where(isNotNull(dishes.category));
  const out = new Map<bigint, { key: string; label: string }>();
  for (const r of rows) {
    const label = labelOf.get(r.category!);
    if (label) out.set(r.id, { key: r.category!, label });
  }
  return out;
}

/** Kitchen totals: how many containers of each dish at each size, under the dish's own category. */
export function countBy(labels: DeliveryLabel[]): KitchenCount[] {
  const acc = new Map<string, KitchenCount>();
  for (const label of labels) {
    for (const line of label.lines) {
      const category = line.dishCategory?.key ?? line.category;
      const key = `${category}|${line.dish}|${line.portion ?? ""}`;
      const hit = acc.get(key);
      if (hit) hit.count += 1;
      else
        acc.set(key, {
          category,
          categoryLabel: line.dishCategory?.label ?? line.categoryLabel,
          dish: line.dish,
          portion: line.portion,
          count: 1,
        });
    }
  }
  return [...acc.values()].sort(
    (a, b) =>
      a.categoryLabel.localeCompare(b.categoryLabel) ||
      a.dish.localeCompare(b.dish) ||
      (a.portion ?? "").localeCompare(b.portion ?? ""),
  );
}

/** Driver once routes are pulled, delivery zone until then. */
export function routeGroupOf(label: DeliveryLabel): string {
  return label.routeDriver ?? label.zoneName ?? UNZONED;
}

export function routeTotals(
  labels: DeliveryLabel[],
): { group: string; labels: number; planned: boolean }[] {
  const acc = new Map<string, { labels: number; planned: boolean }>();
  for (const label of labels) {
    const group = routeGroupOf(label);
    const hit = acc.get(group);
    if (hit) hit.labels += 1;
    else acc.set(group, { labels: 1, planned: label.routeDriver != null });
  }
  return [...acc.entries()]
    .map(([group, v]) => ({ group, ...v }))
    .sort((a, b) => a.group.localeCompare(b.group, undefined, { numeric: true }));
}

/**
 * Print order: driver, then stop number — the sequence the van is loaded in, so the
 * packer works down the pile in the order the driver will hand it over. Falls back to
 * zone then name when a date has not been planned yet.
 */
export function sortForPrinting(labels: DeliveryLabel[]): DeliveryLabel[] {
  return [...labels].sort(
    (a, b) =>
      routeGroupOf(a).localeCompare(routeGroupOf(b), undefined, { numeric: true }) ||
      (a.routeStop ?? Number.MAX_SAFE_INTEGER) - (b.routeStop ?? Number.MAX_SAFE_INTEGER) ||
      a.customerName.localeCompare(b.customerName) ||
      a.personIndex - b.personIndex ||
      a.forDate.localeCompare(b.forDate) ||
      a.deploymentId.localeCompare(b.deploymentId),
  );
}
