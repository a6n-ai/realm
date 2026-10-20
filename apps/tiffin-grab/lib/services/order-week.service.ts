import { toClientCatalog } from "@/lib/catalog/types";
import { dropOffCatalog } from "@/lib/catalog/drop-off";
import { addressService } from "@/lib/services/addresses.service";
import { dropOffsFor } from "./address-drop-off.service";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { zonedDateIso } from "@foundry/commons";
import { buildPlanContext, toCalendarInputs, type PlanView } from "@/components/customer/deliveries/adapter";
import { categoryPortionSlotsForMealSize, categoryPortionsForMealSize } from "@/lib/catalog/category-portions";
import { portionsAfterSwaps } from "@/lib/menu/eating-day-portions";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { buildTrips, type Trip } from "@/lib/deliveries-view";
import { addDays, defaultWeek, mondayOf, parseWeekParam, splitAgenda, type Agenda } from "@/lib/deliveries-view/week";
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
import { holidayNamesForUser } from "@/lib/services/holidays.service";

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
  const all = await myAgendaDots(userId, addDays(firstWeek, -3), addDays(lastWeek, 13));
  const { agenda, otherPlanDays } = splitAgenda(all, sub.publicId, window.first);
  const requested = parseWeekParam(weekParam) ?? defaultWeek(today, window.first);
  const weekStart = requested < firstWeek ? firstWeek : requested > lastWeek ? lastWeek : requested;
  const from = addDays(weekStart, -3);
  const until = addDays(weekStart, 6);

  const [rows, catalog, days, counts, pause, makeupSources, categoryRows, swapCategories, holidays] = await Promise.all([
    myDeliveries(userId, from, until),
    loadCatalogSnapshot(),
    myCalendar(userId, sub.publicId, { from, until }),
    myTiffinCounts(userId, sub.publicId),
    myPausePanel(userId, sub.publicId),
    makeupSourceIdsForOrder(sub.publicId),
    dishCategoriesService.forPlanType(sub.planType),
    dishCategoriesService.swapCategoriesForMealSize(sub.mealSizeId),
    holidayNamesForUser(userId, today),
  ]);
  const categoryLabels = Object.fromEntries(categoryRows.map((r) => [r.key, r.label]));
  const ctx = buildPlanContext({ sub, counts, cutoffHour, timezone, pause, startDate: window.first, holidays, otherPlanDays });
  const savedAddresses = await addressService.list({ userId, orgId: await resolveRequestOrg() });
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
    categoryPortionSlots: categoryPortionSlotsForMealSize(catalog.mealSizes, sub.mealSizeId, sub.addons),
    portionsByDate: await portionsAfterSwaps(sub.publicId, days),
    swapCategories: Object.fromEntries(swapCategories),
    savedAddresses,
    addressDropOffs: await dropOffsFor(savedAddresses.map((a) => a.publicId)),
    dropOff: dropOffCatalog(toClientCatalog(catalog).deliveryCharges, catalog.waivers),
  };
  const inputs = toCalendarInputs({ days, rows: rows.filter((r) => r.orderPublicId === sub.publicId), makeupSources, categoryLabels, swapCategories: Object.fromEntries(swapCategories) });
  return { plan, trips: buildTrips(inputs, now, ctx, sub.publicId), agenda, weekStart, firstWeek, lastWeek, now };
}
