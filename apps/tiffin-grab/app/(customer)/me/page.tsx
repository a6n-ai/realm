import { Suspense } from "react";
import { redirect } from "next/navigation";
import { HomeIcon } from "lucide-react";
import { parseIsoDateUtc, zonedDateIso } from "@foundry/commons";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import {
  myCalendar,
  myPrimarySubscription,
  mySubscriptionsSummary,
  myWaitlistedSubscriptions,
  nextDeliveryByOrder,
  orderTiffinCounts,
} from "@/lib/services/customer-deliveries.service";
import { SubscriptionSection, SubscriptionSectionSkeleton } from "@/components/customer/home/subscription-section";
import { OrdersSection } from "@/components/customer/home/orders-section";
import {
  HomeWeekStrip,
  HomeWeekStripEmpty,
  HomeWeekStripSkeleton,
} from "@/components/customer/home/home-week-strip";
import { NextTripCard, NextTripCardSkeleton } from "@/components/customer/home/next-trip-card";
import { QuickActions } from "@/components/customer/home/quick-actions";
import { HomeMenuWeek, HomeMenuWeekSkeleton } from "@/components/customer/home/home-menu-week";
import { browsePublishedWeek } from "@/lib/menu/browse-published-week";
import { buildTrips } from "@/lib/deliveries-view";
import { coveredDates } from "@/lib/menu/coverage";
import { weekdayKey } from "@foundry/commons";
import { PageShell, PageHeader } from "@/components/ds";
import { formatDateOnly, calendarDaysBetween } from "@/lib/format/datetime";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { categoryPortionsForMealSize } from "@/lib/catalog/category-portions";
import { ReviewNudge } from "./review-nudge";

const HOME_WEEK_DAYS = 14;

export default async function MePage() {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");

  const { timezone } = await getAppSettings();
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const now = Date.now();
  const today = zonedDateIso(now, timezone);

  return (
    <PageShell>
      <PageHeader
        icon={HomeIcon}
        title={formatDateOnly(today, { mode: "weekdayLong" })}
        subtitle={formatDateOnly(today, { mode: "monthDay" })}
      />

      <Suspense fallback={null}>
        <ReviewNudge />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20.5rem] lg:gap-6">
        <Suspense fallback={<NextTripCardSkeleton />}>
          <NextTripData userId={userId} today={today} />
        </Suspense>
        <QuickActions />
      </div>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20.5rem] lg:items-start lg:gap-6">
        <div className="flex w-full min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <Suspense fallback={<HomeWeekStripSkeleton />}>
            <HomeWeekStripData userId={userId} today={today} now={now} timezone={timezone} />
          </Suspense>
          <Suspense fallback={<HomeMenuWeekSkeleton />}>
            <MenuWeekData today={today} timezone={timezone} />
          </Suspense>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-6 max-lg:order-first lg:col-start-2 lg:row-start-1">
          <Suspense fallback={<SubscriptionSectionSkeleton />}>
            <SidebarData userId={userId} today={today} />
          </Suspense>
        </div>
      </div>
    </PageShell>
  );
}

async function HomeWeekStripData({
  userId,
  today,
  now,
  timezone,
}: {
  userId: bigint;
  today: string;
  now: number;
  timezone: string;
}) {
  const untilDate = parseIsoDateUtc(today);
  untilDate.setUTCDate(untilDate.getUTCDate() + HOME_WEEK_DAYS);
  const until = untilDate.toISOString().slice(0, 10);

  const primary = await myPrimarySubscription(userId);
  if (!primary) return <HomeWeekStripEmpty />;

  const { cutoffHour } = await getAppSettings();
  const days = await myCalendar(userId, primary.publicId, { from: today, until });
  const trips = buildTrips(days, now, { cutoffHour, timezone, pooled: 0, lastDeliveryDate: null, deliveryWeekdays: [] });
  return <HomeWeekStrip trips={trips} todayIso={today} />;
}

async function SidebarData({
  userId,
  today,
}: {
  userId: bigint;
  today: string;
}) {
  const [primary, nextByOrder, waitlisted, subs, catalog] = await Promise.all([
    myPrimarySubscription(userId),
    nextDeliveryByOrder(userId, today),
    myWaitlistedSubscriptions(userId),
    mySubscriptionsSummary(userId),
    loadCatalogSnapshot(),
  ]);
  const categoryRows = primary ? await dishCategoriesService.forPlanType(primary.planType) : [];
  const categoryLabels: Record<string, string> = {};
  for (const r of categoryRows) categoryLabels[r.key] = r.label;
  const categoryPortions = primary
    ? categoryPortionsForMealSize(catalog.mealSizes, primary.mealSizeId)
    : {};
  const counts = primary ? await orderTiffinCounts(primary.publicId) : null;
  // lastDeliveryDate is max(deliveries.delivery_date) — last tiffin on the plan, not created/start.
  const daysUntilRenewal = counts?.lastDeliveryDate
    ? calendarDaysBetween(today, counts.lastDeliveryDate)
    : null;
  const subscriptions = primary
    ? [{
        ...primary,
        nextDelivery: nextByOrder.get(primary.publicId) ?? null,
        daysUntilRenewal,
        tiffinCounts: counts,
      }]
    : [];
  return (
    <>
      <SubscriptionSection
        subscriptions={subscriptions}
        waitlisted={waitlisted}
        categoryLabels={categoryLabels}
        categoryPortions={categoryPortions}
      />
      <OrdersSection subs={subs} />
    </>
  );
}

async function NextTripData({ userId, today }: { userId: bigint; today: string }) {
  const primary = await myPrimarySubscription(userId);
  const next = primary ? (await nextDeliveryByOrder(userId, today)).get(primary.publicId) : undefined;
  const counts = primary ? await orderTiffinCounts(primary.publicId) : null;
  return (
    <NextTripCard
      deliveryDate={next?.deliveryDate ?? null}
      coveredDates={next ? coveredDates(next) : []}
      today={today}
      tiffinsLeft={counts?.remaining}
    />
  );
}

async function MenuWeekData({ today, timezone }: { today: string; timezone: string }) {
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const browsed = await browsePublishedWeek(Date.now(), timezone);
  const todayKey = weekdayKey(parseIsoDateUtc(today));
  return (
    <HomeMenuWeek
      week={browsed.week}
      scope={browsed.scope ?? "this"}
      todayKey={browsed.scope === "this" ? todayKey : undefined}
    />
  );
}
