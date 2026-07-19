import { Suspense } from "react";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { parseIsoDateUtc, zonedDateIso } from "@realm/commons";
import { db } from "@/db/client";
import { menuWeeks } from "@/db/schema";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import {
  myActiveSubscriptions,
  myCalendar,
  myDeliveries,
  myDeliveryActivity,
  myDeliveryHistory,
  myDeliveryMeal,
  myPausePanel,
  myWaitlistedSubscriptions,
} from "@/lib/services/customer-deliveries.service";
import { effectiveAddress } from "@/lib/services/deliveries.service";
import { MAX_EXTRA_WINDOWS, WINDOW_DAYS, type CalendarCell } from "./calendar-constants";
import { DeliveryCalendar, DeliveryCalendarSkeleton } from "./delivery-calendar";

type SearchParams = Promise<{ days?: string }>;

export default function MyDeliveriesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<DeliveryCalendarSkeleton />}>
      <MyDeliveriesData searchParams={searchParams} />
    </Suspense>
  );
}

async function MyDeliveriesData({ searchParams }: { searchParams: SearchParams }) {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");

  const { days } = await searchParams;
  // Extra 14-day windows beyond the first, requested via "Load more" (?days=N). Clamped so a
  // hand-edited URL can't force an unbounded read.
  const extraWindows = Math.min(Math.max(Number(days) || 0, 0), MAX_EXTRA_WINDOWS);

  const { timezone } = await getAppSettings();
  const today = zonedDateIso(Date.now(), timezone); // window start in APP tz, not server tz
  const untilDate = parseIsoDateUtc(today);
  untilDate.setUTCDate(untilDate.getUTCDate() + WINDOW_DAYS * (extraWindows + 1));
  const until = untilDate.toISOString().slice(0, 10);

  // History window: 30 days back from today (exclusive of today — myDeliveryHistory's
  // `before` bound), computed the same way as `until` above so both stay in the app tz.
  const sinceDate = parseIsoDateUtc(today);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - 30);
  const since = sinceDate.toISOString().slice(0, 10);

  // Reads only — this page never calls reconcileMakeups/materializeDeliveries.
  const [subscriptions, rawDeliveries, waitlisted, history, activity] = await Promise.all([
    myActiveSubscriptions(userId),
    myDeliveries(userId, today, until),
    myWaitlistedSubscriptions(userId),
    myDeliveryHistory(userId, since, today),
    myDeliveryActivity(userId),
  ]);

  // myDeliveries doesn't join the order's own address columns (it only returns the delivery's
  // override columns), so the order's address — needed by effectiveAddress for the "inherit"
  // case where all four override columns are NULL — is threaded from the subscriptions list
  // already in hand, keyed by orderPublicId, rather than re-querying per row.
  const subscriptionByPublicId = new Map(subscriptions.map((s) => [s.publicId, s]));

  // Pause budget panel per subscription, for the calendar's "N pauses left" / indefinite-toggle
  // gating — myPausePanel re-checks ownership itself, redundant with the map key here but cheap
  // and keeps the IDOR guard on every read path, not just the mutating actions.
  const pausePanelEntries = await Promise.all(
    subscriptions.map(async (s) => [s.publicId, await myPausePanel(userId, s.publicId)] as const),
  );
  const pausePanels = Object.fromEntries(pausePanelEntries);

  // Calendar meal-picker cells (Task 9): one myCalendar call per subscription over the same
  // [today, until] window as the delivery list above, so "this week + next week" both come back
  // in a single fetch and the mobile week-toggle / desktop month-nav just filter it client-side.
  const calendarEntries = await Promise.all(
    subscriptions.map(async (s) => [s.publicId, await myCalendar(userId, s.publicId, { from: today, until })] as const),
  );
  const calendarBySub = Object.fromEntries(calendarEntries);

  // myCalendar's CalendarDay omits the released week's own id (it only resolves against it
  // internally) — resolve weekStart -> menuWeekId separately so pickMyDish/applyMyDishToWeek
  // (which require it) can be called from the calendar cells.
  const weekStarts = [...new Set(Object.values(calendarBySub).flat().map((c) => mondayOfIso(c.date)))];
  const planTypes = [...new Set(subscriptions.map((s) => s.planType))];
  const releasedWeeks = weekStarts.length && planTypes.length
    ? await db
        .select({ planType: menuWeeks.planType, weekStart: menuWeeks.weekStart, publicId: menuWeeks.publicId })
        .from(menuWeeks)
        .where(and(inArray(menuWeeks.planType, planTypes), inArray(menuWeeks.weekStart, weekStarts), eq(menuWeeks.status, "released")))
    : [];
  const menuWeekIdByKey = new Map(releasedWeeks.map((w) => [`${w.planType}:${w.weekStart}`, w.publicId]));

  const calendarCells: Record<string, CalendarCell[]> = {};
  for (const s of subscriptions) {
    calendarCells[s.publicId] = (calendarBySub[s.publicId] ?? []).map((c) => ({
      ...c,
      menuWeekId: menuWeekIdByKey.get(`${s.planType}:${mondayOfIso(c.date)}`) ?? null,
    }));
  }

  // Category labels for the picker's per-slot headings — merged across plan types since a
  // customer only ever has one active planType's worth of categories in view at a time, but the
  // fetch is deduped by planType regardless.
  const categoryRows = await Promise.all(planTypes.map((pt) => dishCategoriesService.forPlanType(pt)));
  const categoryLabels: Record<string, string> = {};
  for (const rows of categoryRows) for (const r of rows) categoryLabels[r.key] = r.label;

  const deliveries = await Promise.all(
    rawDeliveries.map(async (d) => {
      const meal = await myDeliveryMeal(d);
      const hasAddressOverride = d.addressLine !== null;
      const subscription = subscriptionByPublicId.get(d.orderPublicId);
      // Unreachable in practice: myDeliveries scopes by orders.userId, so every delivery's
      // orderPublicId is one of this user's own orders, and only active/paused orders are
      // returned by myActiveSubscriptions — any delivery missing from subscriptionByPublicId
      // is dropped client-side by DeliveryCalendar's bySub grouping before this fallback matters.
      const address = subscription
        ? effectiveAddress(d, subscription)
        : { fullName: "", addressLine: "", city: "", postalCode: "", zoneId: null };
      return { ...d, meal, address, hasAddressOverride };
    }),
  );

  return (
    <DeliveryCalendar
      subscriptions={subscriptions}
      deliveries={deliveries}
      pausePanels={pausePanels}
      calendarCells={calendarCells}
      categoryLabels={categoryLabels}
      extraWindows={extraWindows}
      waitlisted={waitlisted}
      history={history}
      activity={activity}
      today={today}
    />
  );
}
