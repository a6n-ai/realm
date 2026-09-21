import { Suspense } from "react";
import { ReviewNudge } from "@/app/(customer)/me/review-nudge";
import { redirect } from "next/navigation";
import { zonedDateIso } from "@foundry/commons";
import { DeliveriesSkeleton } from "@/components/customer/deliveries/deliveries-skeleton";
import { DeliveriesView } from "@/components/customer/deliveries/deliveries-view";
import { NoPlan } from "@/components/customer/deliveries/no-plan";
import { buildPlanContext, pickDefaultTrip, toCalendarInputs, type PlanView } from "@/components/customer/deliveries/adapter";
import { buildTrips } from "@/lib/deliveries-view";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { categoryPortionsForMealSize } from "@/lib/catalog/category-portions";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { currentUserId } from "@/lib/services/session-service";
import {
  makeupSourceIdsForOrder,
  myActiveSubscriptions,
  myCalendar,
  myDeliveries,
  myPausePanel,
  myPrimarySubscription,
  myTiffinCounts,
  myWaitlistedSubscriptions,
} from "@/lib/services/customer-deliveries.service";
import { monthFetchRange, parseMonthParam } from "@/app/(customer)/me/deliveries/calendar-constants";

export type HubSearchParams = Promise<{ month?: string; sub?: string; trip?: string; action?: string }>;
type SearchParams = HubSearchParams;

export function DeliveriesHub({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<DeliveriesSkeleton />}>
      <Suspense fallback={null}><ReviewNudge /></Suspense>
      <MyDeliveriesData searchParams={searchParams} />
    </Suspense>
  );
}

async function MyDeliveriesData({ searchParams }: { searchParams: SearchParams }) {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");

  const { month: monthParam, sub: subParam, trip: tripParam, action: actionParam } = await searchParams;
  const { timezone, cutoffHour } = await getAppSettings();
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const now = Date.now();
  const today = zonedDateIso(now, timezone);
  const monthKey = parseMonthParam(monthParam, today);
  const { from, until } = monthFetchRange(monthKey, today);

  const [subs, waitlisted, primary] = await Promise.all([
    myActiveSubscriptions(userId),
    myWaitlistedSubscriptions(userId),
    myPrimarySubscription(userId),
  ]);
  if (subs.length === 0 || !primary) return <NoPlan waitlisted={waitlisted} />;

  const sub = (subParam ? subs.find((s) => s.publicId === subParam) : null) ?? primary;

  const [rows, days, counts, pause, makeupSources, catalog, categoryRows, swapCategories] = await Promise.all([
    myDeliveries(userId, from, until),
    myCalendar(userId, sub.publicId, { from, until }),
    myTiffinCounts(userId, sub.publicId),
    myPausePanel(userId, sub.publicId),
    makeupSourceIdsForOrder(sub.publicId),
    loadCatalogSnapshot(),
    dishCategoriesService.forPlanType(sub.planType),
    dishCategoriesService.swapCategoriesForMealSize(sub.mealSizeId),
  ]);
  const categoryLabels = Object.fromEntries(categoryRows.map((r) => [r.key, r.label]));

  const ctx = buildPlanContext({ sub, counts, cutoffHour, timezone, pause });
  const inputs = toCalendarInputs({ days, rows: rows.filter((r) => r.orderPublicId === sub.publicId), makeupSources, categoryLabels });
  const trips = buildTrips(inputs, now, ctx);
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
    swapCategories: Object.fromEntries(swapCategories),
  };

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <DeliveriesView plan={plan} subs={subs} trips={trips} now={now} monthKey={monthKey} initialTrip={pickDefaultTrip(trips, tripParam)} initialAction={actionParam ?? null} />
    </div>
  );
}
