import { requireCustomerIdOrRedirect } from "@/lib/account/customer";
import { toClientCatalog } from "@/lib/catalog/types";
import { dropOffCatalog } from "@/lib/catalog/drop-off";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { after } from "next/server";
import { expireUnpaidStripeOrders } from "@/lib/orders/unpaid-checkouts";
import { zonedDateIso } from "@foundry/commons";
import { DeliveriesSkeleton } from "@/components/customer/deliveries/deliveries-skeleton";
import { DeliveriesView } from "@/components/customer/deliveries/deliveries-view";
import { NoPlan } from "@/components/customer/deliveries/no-plan";
import { buildPlanContext, toCalendarInputs, type PlanView } from "@/lib/deliveries/view/adapter";
import { buildTrips } from "@/lib/deliveries/view";
import { dishCategoriesService } from "@/lib/menu/dish-categories.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { categoryPortionSlotsForMealSize, categoryPortionsForMealSize } from "@/lib/catalog/category-portions";
import { portionsAfterSwaps } from "@/lib/menu/eating-day-portions";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { addressService } from "@/lib/services/addresses.service";
import { dropOffsFor } from "@/lib/deliveries/address-drop-off.service";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import {
  makeupSourceIdsForOrder,
  myActiveSubscriptions,
  orderPaymentLocked,
  myCalendar,
  myDeliveries,
  myEndedPlan,
  myPausePanel,
  myAgendaDots,
  mySubscriptionWindows,
  myTiffinCounts,
  myWaitlistedSubscriptions,
} from "@/lib/deliveries/customer-deliveries.service";
import { stripeMethodAvailable } from "@/lib/payments/stripe";
import { getClaimPaymentContextForOrder } from "@/lib/payments/verification";
import { holidayNamesForUser } from "@/lib/deliveries/holidays.service";
import { defaultWeek, parseWeekParam, splitAgenda } from "@/lib/deliveries/view/week";
import { addDaysIso, mondayOfIso } from "@foundry/commons/util/dates";
import { requestNow } from "@/lib/dates/request-now";

export type HubSearchParams = Promise<{ week?: string; sub?: string; trip?: string; action?: string }>;
type SearchParams = HubSearchParams;

export function DeliveriesHub({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<DeliveriesSkeleton />}>
      <MyDeliveriesData searchParams={searchParams} />
    </Suspense>
  );
}

async function MyDeliveriesData({ searchParams }: { searchParams: SearchParams }) {
  const userId = await requireCustomerIdOrRedirect();
  after(() => expireUnpaidStripeOrders({ userId }));

  const { week: weekParam, sub: subParam, trip: tripParam, action: actionParam } = await searchParams;
  const { timezone, cutoffHour, currency } = await getAppSettings();
  const now = requestNow();
  const today = zonedDateIso(now, timezone);
  const [allSubs, waitlisted, windows, [userRow]] = await Promise.all([
    myActiveSubscriptions(userId),
    myWaitlistedSubscriptions(userId, now),
    mySubscriptionWindows(userId, today),
    db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  if (allSubs.length === 0) {
    const cardOk = waitlisted.some((s) => s.pay && !s.pay.expired) ? await stripeMethodAvailable() : true;
    return <NoPlan waitlisted={waitlisted} ended={waitlisted.length ? null : await myEndedPlan(userId)} cardAvailable={cardOk} />;
  }
  const subs = [...allSubs].sort((a, b) => (windows[a.publicId]?.first ?? "").localeCompare(windows[b.publicId]?.first ?? "") || a.publicId.localeCompare(b.publicId));

  // The page shows ONE plan; ?sub picks it, else the plan with the soonest upcoming delivery.
  const soonest = [...subs].filter((s) => windows[s.publicId]?.next).sort((a, b) => windows[a.publicId]!.next!.localeCompare(windows[b.publicId]!.next!))[0];
  const sub = subs.find((s) => s.publicId === subParam) ?? soonest ?? subs[0]!;
  const win = windows[sub.publicId];

  // One light query for the strip; the heavy per-trip calendar is loaded for the selected week only.
  // The strip starts at this plan's first week (a plan starting next month must not open with empty weeks to scroll past).
  const firstWeek = mondayOfIso(win && win.first > today ? win.first : today);
  const lastWeek = mondayOfIso(win && win.last > today ? win.last : today);
  const all = await myAgendaDots(userId, firstWeek, addDaysIso(lastWeek, 13));
  const { agenda, otherPlanDays } = splitAgenda(all, sub.publicId, win?.first);

  const tripWeek = tripParam && /^\d{4}-\d{2}-\d{2}$/.test(tripParam) ? mondayOfIso(tripParam) : null;
  const requested = parseWeekParam(weekParam) ?? tripWeek ?? defaultWeek(today, win?.first);
  const weekStart = requested < firstWeek ? firstWeek : requested > lastWeek ? lastWeek : requested;
  const from = addDaysIso(weekStart, -3);
  const until = addDaysIso(weekStart, 6);

  const [locked, rows, catalog, days, counts, pause, makeupSources, categoryRows, swapCategories, holidays] = await Promise.all([
    orderPaymentLocked(sub.publicId),
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
  // Payment-review plans hide the calendar and show the claim form instead.
  const claimPayment = locked ? await getClaimPaymentContextForOrder(sub.publicId) : null;
  const cardAvailable = claimPayment?.methodId === "stripe" ? await stripeMethodAvailable() : false;
  const categoryLabels = Object.fromEntries(categoryRows.map((r) => [r.key, r.label]));
  const ctx = buildPlanContext({ counts, cutoffHour, timezone, startDate: win?.first, holidays, otherPlanDays });
  const savedAddresses = await addressService.list({ userId, orgId: await resolveRequestOrg() });
  const addressDropOffs = await dropOffsFor(savedAddresses.map((a) => a.publicId));
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
    addressDropOffs,
    dropOff: dropOffCatalog(toClientCatalog(catalog).deliveryCharges, catalog.waivers),
  };
  const inputs = toCalendarInputs({ days, rows: rows.filter((r) => r.orderPublicId === sub.publicId), makeupSources, categoryLabels, swapCategories: Object.fromEntries(swapCategories) });
  const trips = buildTrips(inputs, now, ctx, sub.publicId);
  const initialTrip = tripParam && trips.some((t) => t.date === tripParam || t.coversDates.includes(tripParam)) ? tripParam : null;

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <DeliveriesView
        plan={plan}
        subs={subs}
        waitingRenewal={waitlisted.length > 0}
        windows={windows}
        trips={trips}
        agenda={agenda}
        weekStart={weekStart}
        firstWeek={firstWeek}
        lastWeek={lastWeek}
        now={now}
        customerName={userRow?.name ?? null}
        locked={locked}
        claimPayment={claimPayment}
        cardAvailable={cardAvailable}
        currency={currency}
        initialTrip={initialTrip}
        initialAction={actionParam ?? null}
      />
    </div>
  );
}
