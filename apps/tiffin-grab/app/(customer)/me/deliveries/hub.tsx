import { Suspense } from "react";
import { ReviewNudge } from "@/app/(customer)/me/review-nudge";
import { redirect } from "next/navigation";
import { zonedDateIso } from "@foundry/commons";
import { DeliveriesSkeleton } from "@/components/customer/deliveries/deliveries-skeleton";
import { DeliveriesView } from "@/components/customer/deliveries/deliveries-view";
import { NoPlan } from "@/components/customer/deliveries/no-plan";
import { buildPlanContext, toCalendarInputs, type PlanView } from "@/components/customer/deliveries/adapter";
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
  myAgendaDots,
  mySubscriptionWindows,
  myTiffinCounts,
  myWaitlistedSubscriptions,
} from "@/lib/services/customer-deliveries.service";
import { addDays, defaultWeek, mondayOf, parseWeekParam } from "@/lib/deliveries-view/week";

export type HubSearchParams = Promise<{ week?: string; sub?: string; trip?: string; action?: string }>;
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

  const { week: weekParam, sub: subParam, trip: tripParam, action: actionParam } = await searchParams;
  const { timezone, cutoffHour } = await getAppSettings();
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const now = Date.now();
  const today = zonedDateIso(now, timezone);
  const [allSubs, waitlisted, windows] = await Promise.all([
    myActiveSubscriptions(userId),
    myWaitlistedSubscriptions(userId),
    mySubscriptionWindows(userId, today),
  ]);
  if (allSubs.length === 0) return <NoPlan waitlisted={waitlisted} />;
  const subs = [...allSubs].sort((a, b) => (windows[a.publicId]?.first ?? "").localeCompare(windows[b.publicId]?.first ?? "") || a.publicId.localeCompare(b.publicId));

  // One light query for the whole strip; the heavy per-trip calendar is loaded for the selected week only.
  const firstWeek = mondayOf(today);
  const lastDate = subs.reduce((m, s) => ((windows[s.publicId]?.last ?? "") > m ? windows[s.publicId]!.last : m), today);
  const lastWeek = mondayOf(lastDate);
  const agenda = await myAgendaDots(userId, firstWeek, addDays(lastWeek, 6));

  const tripWeek = tripParam && /^\d{4}-\d{2}-\d{2}$/.test(tripParam) ? mondayOf(tripParam) : null;
  const requested = parseWeekParam(weekParam) ?? tripWeek ?? defaultWeek(today, agenda);
  const weekStart = requested < firstWeek ? firstWeek : requested > lastWeek ? lastWeek : requested;
  const from = addDays(weekStart, -3);
  const until = addDays(weekStart, 6);

  const [rows, catalog] = await Promise.all([myDeliveries(userId, from, until), loadCatalogSnapshot()]);
  const built = await Promise.all(
    subs.map(async (sub) => {
      const [days, counts, pause, makeupSources, categoryRows, swapCategories] = await Promise.all([
        myCalendar(userId, sub.publicId, { from, until }),
        myTiffinCounts(userId, sub.publicId),
        myPausePanel(userId, sub.publicId),
        makeupSourceIdsForOrder(sub.publicId),
        dishCategoriesService.forPlanType(sub.planType),
        dishCategoriesService.swapCategoriesForMealSize(sub.mealSizeId),
      ]);
      const categoryLabels = Object.fromEntries(categoryRows.map((r) => [r.key, r.label]));
      const ctx = buildPlanContext({ sub, counts, cutoffHour, timezone, pause });
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
      const inputs = toCalendarInputs({ days, rows: rows.filter((r) => r.orderPublicId === sub.publicId), makeupSources, categoryLabels, swapCategories: Object.fromEntries(swapCategories) });
      return { plan, trips: buildTrips(inputs, now, ctx, sub.publicId) };
    }),
  );
  const plans = built.map((b) => b.plan);
  const trips = built.flatMap((b) => b.trips).sort((a, b) => a.date.localeCompare(b.date));

  const valid = (t: string | undefined) => (t && trips.some((x) => x.date === t) ? t : null);
  const initialTrip = valid(tripParam);
  const filter = subParam && subs.some((s) => s.publicId === subParam) ? subParam : null;

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <DeliveriesView
        plans={plans}
        windows={windows}
        trips={trips}
        agenda={agenda}
        weekStart={weekStart}
        lastWeek={lastWeek}
        now={now}
        initialTrip={initialTrip}
        initialPlan={filter}
        initialFilter={filter}
        initialAction={actionParam ?? null}
      />
    </div>
  );
}
