import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
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
import { categoryPortionSlotsForMealSize, categoryPortionsForMealSize } from "@/lib/catalog/category-portions";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { currentUserId } from "@/lib/services/session-service";
import { addressService } from "@/lib/services/addresses.service";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import {
  makeupSourceIdsForOrder,
  myActiveSubscriptions,
  orderPaymentLocked,
  myCalendar,
  myDeliveries,
  myPausePanel,
  myPrimarySubscription,
  myAgendaDots,
  mySubscriptionWindows,
  myTiffinCounts,
  myWaitlistedSubscriptions,
} from "@/lib/services/customer-deliveries.service";
import { addDays, defaultWeek, mondayOf, parseWeekParam, type Agenda } from "@/lib/deliveries-view/week";

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
  const [allSubs, waitlisted, windows, [userRow]] = await Promise.all([
    myActiveSubscriptions(userId),
    myWaitlistedSubscriptions(userId),
    mySubscriptionWindows(userId, today),
    db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  if (allSubs.length === 0) return <NoPlan waitlisted={waitlisted} />;
  const subs = [...allSubs].sort((a, b) => (windows[a.publicId]?.first ?? "").localeCompare(windows[b.publicId]?.first ?? "") || a.publicId.localeCompare(b.publicId));

  // The page shows ONE plan; ?sub picks it, else the plan with the soonest upcoming delivery.
  const soonest = [...subs].filter((s) => windows[s.publicId]?.next).sort((a, b) => windows[a.publicId]!.next!.localeCompare(windows[b.publicId]!.next!))[0];
  const sub = subs.find((s) => s.publicId === subParam) ?? soonest ?? subs[0]!;
  const win = windows[sub.publicId];

  // One light query for the strip; the heavy per-trip calendar is loaded for the selected week only.
  // The strip starts at this plan's first week (a plan starting next month must not open with empty weeks to scroll past).
  const firstWeek = mondayOf(win && win.first > today ? win.first : today);
  const lastWeek = mondayOf(win && win.last > today ? win.last : today);
  const all = await myAgendaDots(userId, firstWeek, addDays(lastWeek, 6));
  const agenda: Agenda = {};
  for (const [date, ds] of Object.entries(all)) {
    const mine = ds.filter((d) => d.orderId === sub.publicId);
    if (mine.length) agenda[date] = mine;
  }

  const tripWeek = tripParam && /^\d{4}-\d{2}-\d{2}$/.test(tripParam) ? mondayOf(tripParam) : null;
  const requested = parseWeekParam(weekParam) ?? tripWeek ?? defaultWeek(today, agenda);
  const weekStart = requested < firstWeek ? firstWeek : requested > lastWeek ? lastWeek : requested;
  const from = addDays(weekStart, -3);
  const until = addDays(weekStart, 6);

  const [locked, rows, catalog, days, counts, pause, makeupSources, categoryRows, swapCategories] = await Promise.all([
    orderPaymentLocked(sub.publicId),
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
  const ctx = buildPlanContext({ sub, counts, cutoffHour, timezone, pause, startDate: win?.first });
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
    categoryPortionSlots: categoryPortionSlotsForMealSize(catalog.mealSizes, sub.mealSizeId),
    swapCategories: Object.fromEntries(swapCategories),
    savedAddresses,
    deliveryStrategies: catalog.deliveryCharges?.deliveryStrategies.map(s => ({ publicId: s.publicId, name: s.name })) ?? [],
  };
  const inputs = toCalendarInputs({ days, rows: rows.filter((r) => r.orderPublicId === sub.publicId), makeupSources, categoryLabels, swapCategories: Object.fromEntries(swapCategories) });
  const trips = buildTrips(inputs, now, ctx, sub.publicId);
  const initialTrip = tripParam && trips.some((t) => t.date === tripParam || t.coversDates.includes(tripParam)) ? tripParam : null;

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <DeliveriesView
        plan={plan}
        subs={subs}
        windows={windows}
        trips={trips}
        agenda={agenda}
        weekStart={weekStart}
        firstWeek={firstWeek}
        lastWeek={lastWeek}
        now={now}
        customerName={userRow?.name ?? null}
        locked={locked}
        initialTrip={initialTrip}
        initialAction={actionParam ?? null}
      />
    </div>
  );
}
