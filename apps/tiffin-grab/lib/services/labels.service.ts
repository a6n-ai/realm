// Per-day packing-label manifest for kitchen staff: one row per Tiffin-plan delivery on a
// date, with the customer's phone/name/plan and up to 7 item/qty columns matching the physical
// containers used to pack a box. Reuses resolveDeliveryMeal (the same "what a subscriber
// receives" resolver the customer calendar uses) rather than re-deriving meal picks.
import { and, asc, eq, inArray } from "drizzle-orm";
import { parsePhoneNumberWithError } from "libphonenumber-js";
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
  users,
} from "@/db/schema";
import { coveredDates, occurrenceDates } from "@/lib/menu/coverage";
import { fulfillmentReadyOrder } from "@/lib/orders/fulfillment";
import { loadExtraDates } from "@/lib/services/delivery-extras";
import { resolveTripDay, swapsForDay, weekLoader } from "@/lib/menu/trip-meals";
import { packingItemLabel } from "@/lib/menu/packing-item-label";
import { portionForPick, portionsByCategory, sumTuForPicks } from "@/lib/menu/pick-size";
import { tuToNatural } from "@/lib/menu/format-tu";
import { dishCategoriesService } from "./dish-categories.service";

const ITEM_SLOTS = 7;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type PackingLabelRow = {
  deliveryPublicId: string;
  forDate: string;
  forLabel: string | null;
  customerPhone: string;
  firstName: string;
  planName: string;
  mealSizeName: string;
  items: { name: string; qty: number }[]; // length <= ITEM_SLOTS; qty is converted (oz / pieces), not TU
};

/** National-format a stored E.164 number (e.g. "(416) 555-1234"); falls back to the raw value if it doesn't parse. */
function formatCanadianPhone(raw: string | null): string {
  if (!raw) return "";
  try {
    return parsePhoneNumberWithError(raw).formatNational();
  } catch {
    return raw;
  }
}

export async function getPackingLabels(dateIso: string): Promise<PackingLabelRow[]> {
  const rows = await db
    .select({
      deliveryId: deliveries.id,
      deliveryPublicId: deliveries.publicId,
      deliveryDate: deliveries.deliveryDate,
      coversDates: deliveries.coversDates,
      orderId: orders.id,
      fullName: orders.fullName,
      persons: orders.persons,
      planId: orders.planId,
      mealSizeId: orders.mealSizeId,
      categoryCounts: orders.categoryCounts,
      planName: plans.name,
      mealSizeName: mealSizes.name,
      userPhone: users.phone,
    })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .where(and(
      eq(deliveries.deliveryDate, dateIso),
      eq(deliveries.status, "scheduled"),
      eq(plans.planType, "tiffin"),
      // Same gate as daily labels / Optimo — payment-review and rejected stay off the sheet.
      fulfillmentReadyOrder(),
    ));
  if (rows.length === 0) return [];

  const categories = await dishCategoriesService.forPlanType("tiffin");
  const sortOrder = new Map(categories.map((c) => [c.key, c.sortOrder]));

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
      .where(inArray(mealSizeItems.mealSizeId, [...new Set(rows.map((r) => r.mealSizeId))])),
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
      .where(inArray(deliveryCategorySwaps.deliveryId, rows.map((r) => r.deliveryId)))
      .orderBy(asc(deliveryCategorySwaps.id)),
  ]);
  const tuByKey = new Map(
    tuRows.map((c) => [c.key, { tuUnitType: c.tuUnitType, tuUnitSize: Number(c.tuUnitSize), tuUnitLabel: c.tuUnitLabel }]),
  );

  const extrasById = await loadExtraDates(db, rows.map((r) => r.deliveryId));
  const out: PackingLabelRow[] = [];
  for (const row of rows) {
    const trip = { id: row.deliveryId, deliveryDate: row.deliveryDate };
    const covered = coveredDates(row);
    // A day a moved-in tiffin doubled up on repeats here — one row per physical tiffin, not per date.
    const occurrences = occurrenceDates(row, extrasById.get(row.deliveryId));
    for (const forDate of occurrences) {
    const daySwaps = swapsForDay(swapRows, trip, forDate);
    // Sum resolved category quantities across every person on the order onto one row; dish
    // names are taken from person 1's picks (an order's persons can technically pick different
    // dishes, but a packing label needs one name per line — this is the documented assumption).
    // Count-slot names include the summed qty ("Roti 8"), so format after the person loop.
    const qtyByCategory = new Map<string, number>();
    const picksByCategory = new Map<string, { name: string }[]>();
    const portions = portionsByCategory(
      sizeItems.filter((i) => i.mealSizeId === row.mealSizeId),
      tuByKey,
      daySwaps,
    );
    const week = await loadWeek(forDate);
    if (week) {
      for (let person = 1; person <= row.persons; person++) {
        const resolved = await resolveTripDay(
          { id: row.orderId, planId: row.planId, mealSizeId: row.mealSizeId, categoryCounts: row.categoryCounts },
          week,
          forDate,
          person,
          daySwaps,
        );
        for (const cat of resolved) {
          qtyByCategory.set(cat.category, (qtyByCategory.get(cat.category) ?? 0) + cat.quantity);
          if (!picksByCategory.has(cat.category)) picksByCategory.set(cat.category, cat.picks);
        }
      }
    }

    const items = [...qtyByCategory.entries()]
      .filter(([, qty]) => qty > 0)
      .sort(([a], [b]) => (sortOrder.get(a) ?? 0) - (sortOrder.get(b) ?? 0))
      .slice(0, ITEM_SLOTS)
      .map(([category, pickCount]) => {
        const picks = picksByCategory.get(category) ?? [];
        const pickPortions = picks.map((_, i) => portionForPick(portions, category, i + 1));
        const converter = tuByKey.get(category);
        const tuTotal = sumTuForPicks(
          sizeItems.filter((i) => i.mealSizeId === row.mealSizeId),
          category,
          pickCount,
          daySwaps,
          tuByKey,
        );
        const qty = converter ? tuToNatural(converter, tuTotal) : pickCount;
        return {
          name: packingItemLabel(picks, pickPortions, qty, converter?.tuUnitType),
          qty,
        };
      });

    out.push({
      deliveryPublicId: row.deliveryPublicId,
      forDate,
      forLabel: covered.length > 1 ? `For ${DAY_NAMES[parseIsoDateUtc(forDate).getUTCDay()]}` : null,
      customerPhone: formatCanadianPhone(row.userPhone),
      firstName: (row.fullName ?? "").trim().split(/\s+/)[0] ?? "",
      planName: row.planName,
      mealSizeName: row.mealSizeName,
      items,
    });
    }
  }

  return out.sort((a, b) => a.firstName.localeCompare(b.firstName) || a.forDate.localeCompare(b.forDate));
}
