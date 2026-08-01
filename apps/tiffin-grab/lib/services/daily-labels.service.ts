// One day, every subscription: the labels that go on the containers and the counts the
// kitchen cooks from. Replaces the Label Maker spreadsheet's Export Sheet1 + Count Items.
//
// Every read of "what does this subscriber receive" goes through resolveDeliveryMeal —
// re-deriving the pick → default fallback here would let the label disagree with what the
// customer sees on their calendar, which is the one failure this must not have.
import { and, asc, eq, inArray } from "drizzle-orm";
import { weekdayKey, parseIsoDateUtc } from "@realm/commons";
import { db } from "@/db/client";
import {
  deliveries,
  deliveryZones,
  mealSizeItems,
  mealSizes,
  orders,
  plans,
  users,
} from "@/db/schema";
import { effectiveAddress } from "@/lib/services/deliveries.service";
import { menuService } from "@/lib/services/menu.service";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import { resolveDeliveryMeal } from "@/lib/menu/resolve-delivery-meal";
import { portionForPick, portionsByCategory } from "@/lib/menu/pick-size";
import type { DayOfWeek } from "@/lib/menu/delivery-dates";

export type LabelLine = {
  category: string;
  categoryLabel: string;
  dish: string;
  /** "8oz" — null when the meal size carries no weight for that slot. */
  portion: string | null;
  /** True when the customer never picked and the menu default was used. */
  defaulted: boolean;
};

export type DeliveryLabel = {
  deliveryPublicId: string;
  orderPublicId: string;
  deploymentId: string;
  customerName: string;
  phone: string | null;
  addressLine: string;
  city: string;
  postalCode: string;
  zoneName: string | null;
  planName: string;
  mealSizeName: string;
  /** 1-based; an order for 2 people prints 2 labels, as the kitchen packs 2 tiffins. */
  personIndex: number;
  persons: number;
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
  /** Labels grouped by zone name, the closest thing to the sheet's D1/D4/D8 routes. */
  byZone: { zone: string; labels: number }[];
};

const EMPTY = (date: string, weekStart: string): DailyLabelSheet => ({
  date,
  weekStart,
  menuWeekPublicId: null,
  labels: [],
  counts: [],
  byZone: [],
});

const UNZONED = "Unzoned";

export async function dailyLabelSheet(dateIso: string): Promise<DailyLabelSheet> {
  const weekStart = mondayOfIso(dateIso);
  const dayOfWeek = weekdayKey(parseIsoDateUtc(dateIso)) as DayOfWeek;

  // Exact-match released week, same gate as the customer calendar — never a fallback week,
  // or the kitchen packs a menu nobody was shown.
  const week = await menuService.getReleasedWeek(weekStart);
  if (!week) return EMPTY(dateIso, weekStart);

  const rows = await db
    .select({
      delivery: deliveries,
      order: orders,
      planName: plans.name,
      mealSizeName: mealSizes.name,
      customerEmail: users.email,
      customerPhone: users.phone,
      customerNotes: users.deliveryNotes,
    })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .where(and(eq(deliveries.deliveryDate, dateIso), eq(deliveries.status, "scheduled")))
    .orderBy(asc(deliveries.id));

  if (rows.length === 0) return { ...EMPTY(dateIso, weekStart), menuWeekPublicId: week.publicId };

  const [zones, sizeItems] = await Promise.all([
    db.select({ id: deliveryZones.id, name: deliveryZones.name }).from(deliveryZones),
    db
      .select({
        mealSizeId: mealSizeItems.mealSizeId,
        category: mealSizeItems.category,
        qty: mealSizeItems.qty,
        weightValue: mealSizeItems.weightValue,
        weightUnit: mealSizeItems.weightUnit,
        sortOrder: mealSizeItems.sortOrder,
      })
      .from(mealSizeItems)
      .where(inArray(mealSizeItems.mealSizeId, [...new Set(rows.map((r) => r.order.mealSizeId))])),
  ]);

  const zoneName = new Map(zones.map((z) => [z.id, z.name]));
  // Portions are per meal size, not per order — resolve each size once, not once per label.
  const portionsBySize = new Map(
    [...new Set(sizeItems.map((i) => i.mealSizeId))].map((id) => [
      id,
      portionsByCategory(sizeItems.filter((i) => i.mealSizeId === id)),
    ]),
  );

  const labels: DeliveryLabel[] = [];
  for (const row of rows) {
    const { delivery, order } = row;
    const address = effectiveAddress(delivery, order);
    const portions = portionsBySize.get(order.mealSizeId) ?? new Map();

    for (let person = 1; person <= order.persons; person++) {
      const resolved = await resolveDeliveryMeal(order, week, dayOfWeek, person);
      const lines: LabelLine[] = [];
      for (const category of resolved) {
        category.picks.forEach((pick, i) => {
          lines.push({
            category: category.category,
            categoryLabel: category.label,
            dish: pick.name,
            portion: portionForPick(portions, category.category, i + 1),
            defaulted: pick.isDefaulted,
          });
        });
      }

      labels.push({
        deliveryPublicId: delivery.publicId,
        orderPublicId: order.publicId,
        deploymentId: order.deploymentId,
        customerName: address.fullName,
        phone: row.customerPhone ?? null,
        addressLine: address.addressLine,
        city: address.city,
        postalCode: address.postalCode,
        zoneName: address.zoneId != null ? zoneName.get(address.zoneId) ?? null : null,
        planName: row.planName,
        mealSizeName: row.mealSizeName,
        personIndex: person,
        persons: order.persons,
        deliveryNotes: row.customerNotes?.trim() || null,
        lines,
      });
    }
  }

  return {
    date: dateIso,
    weekStart,
    menuWeekPublicId: week.publicId,
    labels,
    counts: countBy(labels),
    byZone: zoneTotals(labels),
  };
}

/** Kitchen totals: how many containers of each dish at each size. */
export function countBy(labels: DeliveryLabel[]): KitchenCount[] {
  const acc = new Map<string, KitchenCount>();
  for (const label of labels) {
    for (const line of label.lines) {
      const key = `${line.category}|${line.dish}|${line.portion ?? ""}`;
      const hit = acc.get(key);
      if (hit) hit.count += 1;
      else
        acc.set(key, {
          category: line.category,
          categoryLabel: line.categoryLabel,
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

export function zoneTotals(labels: DeliveryLabel[]): { zone: string; labels: number }[] {
  const acc = new Map<string, number>();
  for (const label of labels) {
    const zone = label.zoneName ?? UNZONED;
    acc.set(zone, (acc.get(zone) ?? 0) + 1);
  }
  return [...acc.entries()]
    .map(([zone, count]) => ({ zone, labels: count }))
    .sort((a, b) => a.zone.localeCompare(b.zone));
}
