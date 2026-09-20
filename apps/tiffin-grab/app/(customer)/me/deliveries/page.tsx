import { Suspense } from "react";
import { redirect } from "next/navigation";
import { zonedDateIso } from "@foundry/commons";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import {
  myActiveSubscriptions,
  myPrimarySubscription,
  myWaitlistedSubscriptions,
} from "@/lib/services/customer-deliveries.service";
import { loadOrderDeliveriesBundle } from "@/lib/services/order-deliveries-bundle.service";
import { monthFetchRange, parseMonthParam } from "./calendar-constants";
import { DeliveryCalendar, DeliveryCalendarSkeleton } from "./delivery-calendar";

type SearchParams = Promise<{ month?: string; sub?: string }>;

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

  const { month: monthParam, sub: subParam } = await searchParams;

  const { timezone } = await getAppSettings();
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const today = zonedDateIso(Date.now(), timezone);
  const monthKey = parseMonthParam(monthParam, today);
  const { from, until } = monthFetchRange(monthKey, today);

  const [subscriptions, waitlisted, primary] = await Promise.all([
    myActiveSubscriptions(userId),
    myWaitlistedSubscriptions(userId),
    myPrimarySubscription(userId),
  ]);

  if (subscriptions.length === 0 || !primary) {
    return (
      <DeliveryCalendar
        subscriptions={[]}
        deliveries={[]}
        pausePanels={{}}
        calendarCells={{}}
        categoryLabels={{}}
        categoryPortions={{}}
        monthKey={monthKey}
        waitlisted={waitlisted}
        today={today}
      />
    );
  }

  const selected =
    (subParam ? subscriptions.find((s) => s.publicId === subParam) : null) ?? primary;

  const bundle = await loadOrderDeliveriesBundle(userId, selected, from, until);

  return (
    <DeliveryCalendar
      subscriptions={subscriptions}
      selectedPublicId={selected.publicId}
      deliveries={bundle.deliveries}
      pausePanels={bundle.pausePanels}
      calendarCells={bundle.calendarCells}
      categoryLabels={bundle.categoryLabels}
      categoryPortions={bundle.categoryPortions}
      monthKey={monthKey}
      waitlisted={waitlisted}
      today={today}
      tiffinCounts={bundle.tiffinCounts}
    />
  );
}
