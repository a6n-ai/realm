// Per-trip eating-day read model for the customer/admin day panel.
// One batch for the calendar month: each trip → cards keyed by covers_dates
// (legacy NULL covers → trip date alone). Menu resolve uses the EATING day's
// weekday + that day's menu week; swaps filter by forDate.
import { weekdayKey } from "@foundry/commons";
import type { FileDetail } from "@foundry/storage/model";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  deliveryCategorySwaps,
  dishCategories,
  dishes,
  menuItems,
  orders,
  plans,
} from "@/db/schema";
import { coveredDates } from "@/lib/menu/coverage";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import {
  resolveDeliveryMeal,
  type ResolvedCategory,
} from "@/lib/menu/resolve-delivery-meal";
import { allowedDishIdsForMealSize } from "@/lib/menu/selections.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { menuService } from "@/lib/services/menu.service";

export type TripEatingDayMeal = ResolvedCategory[];

export type TripEatingDayOption = {
  category: string;
  dishId: string;
  name: string;
  image: FileDetail | null;
};

export type TripEatingDaySwap = {
  publicId: string;
  fromCategory: string;
  toCategory: string;
  qtyFrom: number;
  qtyTo: number;
  forDate: string | null;
};

export type TripEatingDay = {
  eatingDate: string;
  weekday: DayOfWeek;
  menuWeekReleased: boolean;
  menuWeekId: string | null;
  picks: TripEatingDayMeal | null;
  options: TripEatingDayOption[];
  appliedSwaps: TripEatingDaySwap[];
};

export type TripWithEatingDays = {
  deliveryPublicId: string;
  deliveryDate: string;
  cutoffAt: number;
  eatingDays: TripEatingDay[];
};

type TripRow = {
  id: bigint;
  publicId: string;
  deliveryDate: string;
  coversDates: string[] | null;
  cutoffAt: number;
};

/**
 * Build per-trip eating-day cards for every delivery in `trips` (typically one
 * calendar month). Uses one released-week fetch + batched swap load — not one
 * query per eating day.
 */
export async function loadTripEatingDays(
  orderPublicId: string,
  trips: TripRow[],
): Promise<TripWithEatingDays[]> {
  if (trips.length === 0) return [];

  const [order] = await db
    .select({
      id: orders.id,
      planId: orders.planId,
      mealSizeId: orders.mealSizeId,
      categoryCounts: orders.categoryCounts,
      planType: plans.planType,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .where(eq(orders.publicId, orderPublicId))
    .limit(1);
  if (!order) return [];

  const allEatingDates = [...new Set(trips.flatMap((t) => coveredDates(t)))];
  const weekStarts = [...new Set(allEatingDates.map((d) => mondayOfIso(d)))];
  const releasedWeeks = await menuService.getReleasedWeeks(weekStarts);
  const weekByStart = new Map(releasedWeeks.map((w) => [w.weekStart, w]));

  const swapRows = await db
    .select({
      publicId: deliveryCategorySwaps.publicId,
      deliveryId: deliveryCategorySwaps.deliveryId,
      fromCategory: deliveryCategorySwaps.fromCategory,
      toCategory: deliveryCategorySwaps.toCategory,
      qtyFrom: deliveryCategorySwaps.qtyFrom,
      qtyTo: deliveryCategorySwaps.qtyTo,
      forDate: deliveryCategorySwaps.forDate,
    })
    .from(deliveryCategorySwaps)
    .where(inArray(deliveryCategorySwaps.deliveryId, trips.map((t) => t.id)));

  const cats = await dishCategoriesService.forPlanType(order.planType as "tiffin" | "healthy");
  const selectableCats = cats.filter((c) => c.selectable && (order.categoryCounts?.[c.key] ?? 0) > 0);
  const planDishIds = await allowedDishIdsForMealSize(order.mealSizeId);

  const itemsByWeekId = new Map<bigint, { dayOfWeek: string; slot: string; dishId: bigint; publicId: string; name: string; image: FileDetail | null }[]>();
  for (const week of releasedWeeks) {
    const items = await db
      .select({
        dayOfWeek: menuItems.dayOfWeek,
        slot: dishCategories.key,
        dishId: menuItems.dishId,
        publicId: dishes.publicId,
        name: dishes.name,
        image: dishes.image,
      })
      .from(menuItems)
      .innerJoin(dishes, eq(menuItems.dishId, dishes.id))
      .innerJoin(dishCategories, eq(dishCategories.id, menuItems.categoryId))
      .where(eq(menuItems.menuWeekId, week.id))
      .orderBy(asc(menuItems.position));
    itemsByWeekId.set(week.id, items);
  }

  const out: TripWithEatingDays[] = [];
  for (const trip of trips) {
    const eatingDays: TripEatingDay[] = [];
    for (const eatingDate of coveredDates(trip)) {
      const weekday = weekdayKey(new Date(`${eatingDate}T00:00:00Z`)) as DayOfWeek;
      const week = weekByStart.get(mondayOfIso(eatingDate));
      const appliedSwaps = swapRows
        .filter((s) => {
          if (s.deliveryId !== trip.id) return false;
          // NULL forDate = legacy trip-wide swap → applies to the trip's own date only.
          const effective = s.forDate ?? trip.deliveryDate;
          return effective === eatingDate;
        })
        .map((s) => ({
          publicId: s.publicId,
          fromCategory: s.fromCategory,
          toCategory: s.toCategory,
          qtyFrom: s.qtyFrom,
          qtyTo: s.qtyTo,
          forDate: s.forDate,
        }));

      if (!week) {
        eatingDays.push({
          eatingDate,
          weekday,
          menuWeekReleased: false,
          menuWeekId: null,
          picks: null,
          options: [],
          appliedSwaps,
        });
        continue;
      }

      const picks = await resolveDeliveryMeal(
        {
          id: order.id,
          planId: order.planId,
          mealSizeId: order.mealSizeId,
          categoryCounts: order.categoryCounts,
        },
        { id: week.id, weekStart: week.weekStart },
        weekday,
        1,
        trip.id,
        { eatingDate, tripDate: trip.deliveryDate },
      );

      const weekItems = itemsByWeekId.get(week.id) ?? [];
      const dayItems = weekItems.filter((i) => i.dayOfWeek === weekday);
      const options: TripEatingDayOption[] = selectableCats.flatMap((c) =>
        dayItems
          .filter((i) => i.slot === c.key && planDishIds.has(i.dishId))
          .map((i) => ({
            category: c.key,
            dishId: i.publicId,
            name: i.name,
            image: i.image ?? null,
          })),
      );

      eatingDays.push({
        eatingDate,
        weekday,
        menuWeekReleased: true,
        menuWeekId: week.publicId,
        picks,
        options,
        appliedSwaps,
      });
    }
    out.push({
      deliveryPublicId: trip.publicId,
      deliveryDate: trip.deliveryDate,
      cutoffAt: trip.cutoffAt,
      eatingDays,
    });
  }
  return out;
}

/** Map deliveryPublicId → eating-day cards for UI lookup. */
export function eatingDaysByDeliveryPublicId(
  trips: TripWithEatingDays[],
): Map<string, TripEatingDay[]> {
  return new Map(trips.map((t) => [t.deliveryPublicId, t.eatingDays]));
}
