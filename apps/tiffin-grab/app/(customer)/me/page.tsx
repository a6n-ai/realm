import { Suspense } from "react";
import { redirect } from "next/navigation";
import { parseIsoDateUtc, zonedDateIso } from "@realm/commons";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import {
  myCalendar,
  myPrimarySubscription,
  myWaitlistedSubscriptions,
  nextDeliveryByOrder,
} from "@/lib/services/customer-deliveries.service";
import { SubscriptionSection, SubscriptionSectionSkeleton } from "@/components/customer/home/subscription-section";
import {
  HomeWeekStrip,
  HomeWeekStripEmpty,
  HomeWeekStripSkeleton,
} from "@/components/customer/home/home-week-strip";
import type { CalendarCell } from "@/app/(customer)/me/deliveries/calendar-constants";
import { HOME_SECTIONS } from "./home-sections";

const HOME_WEEK_DAYS = 14;

export default async function MePage() {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");

  const { timezone } = await getAppSettings();

  return (
    <main className="space-y-5 px-4 py-6 md:px-6 md:py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Home</h1>
        <p className="text-muted-foreground text-sm text-pretty">Everything for your meals, all in one place.</p>
      </header>

      {HOME_SECTIONS.map((section) => {
        if (section.key === "week") {
          return (
            <Suspense key={section.key} fallback={<HomeWeekStripSkeleton />}>
              <HomeWeekStripData userId={userId} timezone={timezone} />
            </Suspense>
          );
        }
        return (
          <Suspense key={section.key} fallback={<SubscriptionSectionSkeleton />}>
            <SubscriptionSectionData userId={userId} timezone={timezone} />
          </Suspense>
        );
      })}
    </main>
  );
}

async function HomeWeekStripData({ userId, timezone }: { userId: bigint; timezone: string }) {
  const today = zonedDateIso(Date.now(), timezone);
  const untilDate = parseIsoDateUtc(today);
  untilDate.setUTCDate(untilDate.getUTCDate() + HOME_WEEK_DAYS);
  const until = untilDate.toISOString().slice(0, 10);

  const primary = await myPrimarySubscription(userId);
  if (!primary) return <HomeWeekStripEmpty />;

  const days = await myCalendar(userId, primary.publicId, { from: today, until });
  const cells: CalendarCell[] = days.map((c) => ({ ...c, menuWeekId: null }));
  return <HomeWeekStrip cells={cells} todayIso={today} />;
}

async function SubscriptionSectionData({ userId, timezone }: { userId: bigint; timezone: string }) {
  const today = zonedDateIso(Date.now(), timezone);
  const [primary, nextByOrder, waitlisted] = await Promise.all([
    myPrimarySubscription(userId),
    nextDeliveryByOrder(userId, today),
    myWaitlistedSubscriptions(userId),
  ]);
  const subscriptions = primary
    ? [{ ...primary, nextDelivery: nextByOrder.get(primary.publicId) ?? null }]
    : [];
  return <SubscriptionSection subscriptions={subscriptions} waitlisted={waitlisted} />;
}
