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
  myCalendar,
  myDeliveries,
  myDeliveryMeal,
  myPausePanel,
  myPrimarySubscription,
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
  // Extra WINDOW_DAYS blocks beyond the first, requested via "Load more" (?days=N). Clamped so a
  // hand-edited URL can't force an unbounded read.
  const extraWindows = Math.min(Math.max(Number(days) || 0, 0), MAX_EXTRA_WINDOWS);

  const { timezone } = await getAppSettings();
  const today = zonedDateIso(Date.now(), timezone);
  const untilDate = parseIsoDateUtc(today);
  untilDate.setUTCDate(untilDate.getUTCDate() + WINDOW_DAYS * (extraWindows + 1));
  const until = untilDate.toISOString().slice(0, 10);

  // One live plan drives the calendar so home + deliveries stay consistent.
  const [primary, waitlisted] = await Promise.all([
    myPrimarySubscription(userId),
    myWaitlistedSubscriptions(userId),
  ]);

  if (!primary) {
    return (
      <DeliveryCalendar
        subscriptions={[]}
        deliveries={[]}
        pausePanels={{}}
        calendarCells={{}}
        categoryLabels={{}}
        extraWindows={extraWindows}
        waitlisted={waitlisted}
        today={today}
      />
    );
  }

  const [rawDeliveries, pausePanel, calendarDays] = await Promise.all([
    myDeliveries(userId, today, until),
    myPausePanel(userId, primary.publicId),
    myCalendar(userId, primary.publicId, { from: today, until }),
  ]);

  const weekStarts = [...new Set(calendarDays.map((c) => mondayOfIso(c.date)))];
  const releasedWeeks = weekStarts.length
    ? await db
        .select({ planType: menuWeeks.planType, weekStart: menuWeeks.weekStart, publicId: menuWeeks.publicId })
        .from(menuWeeks)
        .where(
          and(
            eq(menuWeeks.planType, primary.planType),
            inArray(menuWeeks.weekStart, weekStarts),
            eq(menuWeeks.status, "released"),
          ),
        )
    : [];
  const menuWeekIdByKey = new Map(releasedWeeks.map((w) => [`${w.planType}:${w.weekStart}`, w.publicId]));

  const calendarCells: Record<string, CalendarCell[]> = {
    [primary.publicId]: calendarDays.map((c) => ({
      ...c,
      menuWeekId: menuWeekIdByKey.get(`${primary.planType}:${mondayOfIso(c.date)}`) ?? null,
    })),
  };

  const categoryRows = await dishCategoriesService.forPlanType(primary.planType);
  const categoryLabels: Record<string, string> = {};
  for (const r of categoryRows) categoryLabels[r.key] = r.label;

  // Only surface deliveries for the primary plan (legacy multi-sub rows stay hidden).
  const primaryDeliveries = rawDeliveries.filter((d) => d.orderPublicId === primary.publicId);
  const deliveries = await Promise.all(
    primaryDeliveries.map(async (d) => {
      const meal = await myDeliveryMeal(d);
      const hasAddressOverride = d.addressLine !== null;
      const address = effectiveAddress(d, primary);
      return { ...d, meal, address, hasAddressOverride };
    }),
  );

  return (
    <DeliveryCalendar
      subscriptions={[primary]}
      deliveries={deliveries}
      pausePanels={{ [primary.publicId]: pausePanel }}
      calendarCells={calendarCells}
      categoryLabels={categoryLabels}
      extraWindows={extraWindows}
      waitlisted={waitlisted}
      today={today}
    />
  );
}
