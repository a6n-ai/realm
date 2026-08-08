import { Suspense } from "react";
import { redirect } from "next/navigation";
import { parseIsoDateUtc, zonedDateIso } from "@realm/commons";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import {
  myCalendar,
  myPrimarySubscription,
  mySubscriptionsSummary,
  myWaitlistedSubscriptions,
  nextDeliveryByOrder,
} from "@/lib/services/customer-deliveries.service";
import { SubscriptionSection, SubscriptionSectionSkeleton } from "@/components/customer/home/subscription-section";
import { OrdersSection, OrdersSectionSkeleton } from "@/components/customer/home/orders-section";
import {
  HomeWeekStrip,
  HomeWeekStripEmpty,
  HomeWeekStripSkeleton,
} from "@/components/customer/home/home-week-strip";
import type { CalendarCell } from "@/app/(customer)/me/deliveries/calendar-constants";
import { HomeIcon } from "lucide-react";
import { PageShell, PageHeader } from "@/components/ds";
import { HOME_SECTIONS } from "./home-sections";
import { ReviewNudge } from "./review-nudge";

const HOME_WEEK_DAYS = 14;

export default async function MePage() {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");

  const { timezone } = await getAppSettings();

  return (
    <PageShell>
      <PageHeader
        icon={HomeIcon}
        title="Home"
        subtitle="Everything for your meals, all in one place."
      />

      {/* Never delays the customer home render — it's a courtesy nudge, not content. */}
      <Suspense fallback={null}>
        <ReviewNudge />
      </Suspense>

      {/* Mobile stacks; desktop uses the width for week + plan side-by-side. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {HOME_SECTIONS.map((section) => {
          if (section.key === "week") {
            return (
              <Suspense key={section.key} fallback={<HomeWeekStripSkeleton />}>
                <HomeWeekStripData userId={userId} timezone={timezone} />
              </Suspense>
            );
          }
          if (section.key === "subscription") {
            return (
              <Suspense key={section.key} fallback={<SubscriptionSectionSkeleton />}>
                <SubscriptionSectionData userId={userId} timezone={timezone} />
              </Suspense>
            );
          }
          return (
            <Suspense key={section.key} fallback={<OrdersSectionSkeleton />}>
              <OrdersSectionData userId={userId} />
            </Suspense>
          );
        })}
      </div>
    </PageShell>
  );
}

async function HomeWeekStripData({ userId, timezone }: { userId: bigint; timezone: string }) {
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
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

async function OrdersSectionData({ userId }: { userId: bigint }) {
  return <OrdersSection subs={await mySubscriptionsSummary(userId)} />;
}

async function SubscriptionSectionData({ userId, timezone }: { userId: bigint; timezone: string }) {
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
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
