import { zonedDateIso } from "@foundry/commons";
import { buildPlanContext, toCalendarInputs, type PlanView } from "@/components/customer/deliveries/adapter";
import { categoryPortionSlotsForMealSize, categoryPortionsForMealSize } from "@/lib/catalog/category-portions";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { buildTrips, type Trip } from "@/lib/deliveries-view";
import { addDays, defaultWeek, mondayOf, parseWeekParam, type Agenda } from "@/lib/deliveries-view/week";
import { getAppSettings } from "@/lib/services/app-settings.service";
import {
  makeupSourceIdsForOrder,
  myAgendaDots,
  myCalendar,
  myDeliveries,
  myPausePanel,
  mySubscriptionWindows,
  myTiffinCounts,
  type Subscription,
} from "@/lib/services/customer-deliveries.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";

export type OrderWeek = {
  plan: PlanView;
  trips: Trip[];
  agenda: Agenda;
  weekStart: string;
  firstWeek: string;
  lastWeek: string;
  now: number;
};

/**
 * Staff view of ONE order in the same week/eating-day model the customer hub uses.
 * `userId` is the order's owner: every myX read is owner-scoped, staff pass the owner's id.
 * Returns null when the order has no deliveries to show.
 */
export async function loadOrderWeek(userId: bigint, sub: Subscription, weekParam: string | undefined): Promise<OrderWeek | null> {
  const { timezone, cutoffHour } = await getAppSettings();
  const now = Date.now();
  const today = zonedDateIso(now, timezone);
  const window = (await mySubscriptionWindows(userId, today))[sub.publicId];
  if (!window) return null;

  const firstWeek = mondayOf(window.first);
  const lastWeek = mondayOf(window.last);
  const all = await myAgendaDots(userId, addDays(firstWeek, -3), addDays(lastWeek, 6));
  const agenda: Agenda = {};
  for (const [date, ds] of Object.entries(all)) {
    const mine = ds.filter((d) => d.orderId === sub.publicId);
    if (mine.length) agenda[date] = mine;
  }
  const requested = parseWeekParam(weekParam) ?? defaultWeek(today, agenda);
  const weekStart = requested < firstWeek ? firstWeek : requested > lastWeek ? lastWeek : requested;
  const from = addDays(weekStart, -3);
  const until = addDays(weekStart, 6);

  const [rows, catalog, days, counts, pause, makeupSources, categoryRows, swapCategories] = await Promise.all([
    myDeliveries(userId, from, until),
    loadCatalogSnapshot(),
    myCalendar(userId, sub.publicId, { from, until }),
    myTiffinCounts(userId, sub.publicId),
    myPausePanel(userId, sub.publicId),
    makeupSourceIdsForOrder(sub.publicId),
    dishCategoriesService.forPlanType(sub.planType),
    dishCategoriesService.swapCategoriesForMealSize(sub.mealSizeId),
  ]);
  const categoryLabels = Object.fromEntries(categoryRows.map((r) => [r.key, r.label]));
  const ctx = buildPlanContext({ sub, counts, cutoffHour, timezone, pause, startDate: window.first });
  const plan: PlanView = {
    orderId: sub.publicId,
    sub,
    counts,
    ctx,
    pause,
    today,
    days,
    categoryLabels,
    categoryPortions: categoryPortionsForMealSize(catalog.mealSizes, sub.mealSizeId),
    categoryPortionSlots: categoryPortionSlotsForMealSize(catalog.mealSizes, sub.mealSizeId),
    swapCategories: Object.fromEntries(swapCategories),
  };
  const inputs = toCalendarInputs({ days, rows: rows.filter((r) => r.orderPublicId === sub.publicId), makeupSources, categoryLabels, swapCategories: Object.fromEntries(swapCategories) });
  return { plan, trips: buildTrips(inputs, now, ctx, sub.publicId), agenda, weekStart, firstWeek, lastWeek, now };
}
