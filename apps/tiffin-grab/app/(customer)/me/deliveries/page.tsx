import { Suspense } from "react";
import { redirect } from "next/navigation";
import { zonedDateIso } from "@realm/commons";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import {
  myActiveSubscriptions,
  myCalendar,
  myDeliveries,
  myDeliveryMeal,
  myPausePanel,
  myPrimarySubscription,
  myTiffinCounts,
  myWaitlistedSubscriptions,
} from "@/lib/services/customer-deliveries.service";
import { effectiveAddress } from "@/lib/services/deliveries.service";
import { monthFetchRange, parseMonthParam, type CalendarCell } from "./calendar-constants";
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
        monthKey={monthKey}
        waitlisted={waitlisted}
        today={today}
      />
    );
  }

  const selected =
    (subParam ? subscriptions.find((s) => s.publicId === subParam) : null) ?? primary;

  const [rawDeliveries, pausePanel, calendarDays, tiffinCounts] = await Promise.all([
    myDeliveries(userId, from, until),
    myPausePanel(userId, selected.publicId),
    myCalendar(userId, selected.publicId, { from, until }),
    myTiffinCounts(userId, selected.publicId),
  ]);

  const calendarCells: Record<string, CalendarCell[]> = {
    [selected.publicId]: calendarDays,
  };

  const categoryRows = await dishCategoriesService.forPlanType(selected.planType);
  const categoryLabels: Record<string, string> = {};
  for (const r of categoryRows) categoryLabels[r.key] = r.label;

  const selectedDeliveries = rawDeliveries.filter((d) => d.orderPublicId === selected.publicId);
  const deliveries = await Promise.all(
    selectedDeliveries.map(async (d) => {
      const meal = await myDeliveryMeal(d);
      const hasAddressOverride = d.addressLine !== null;
      const address = effectiveAddress(d, selected);
      return { ...d, meal, address, hasAddressOverride };
    }),
  );

  return (
    <DeliveryCalendar
      subscriptions={subscriptions}
      selectedPublicId={selected.publicId}
      deliveries={deliveries}
      pausePanels={{ [selected.publicId]: pausePanel }}
      calendarCells={calendarCells}
      categoryLabels={categoryLabels}
      monthKey={monthKey}
      waitlisted={waitlisted}
      today={today}
      tiffinCounts={tiffinCounts}
    />
  );
}
