import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox } from "@/db/schema";
import { AnalyticsStatCards, StatCardsSkeleton, type AnalyticsStatCardItem } from "@/components/dashboard/stat-cards";
import { getNotificationBuckets } from "@/lib/services/analytics/notifications.service";
import { epochBoundsWhere, withDefaultMonth } from "@/lib/list/default-month";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { SegmentedBar } from "@/components/analytics/charts";
import type { Tone } from "@/components/analytics/chart-math";

const STATUS_TONE: Record<string, Tone> = { sent: "success", failed: "destructive", skipped: "muted" };

const intCount = sql<number>`cast(count(*) as int)`;

type SearchParams = Promise<Record<string, string | undefined>>;

async function createdWhere(searchParams: SearchParams) {
  return epochBoundsWhere(notificationOutbox.createdAt, await withDefaultMonth(await searchParams));
}

export default function NotificationAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<StatCardsSkeleton count={4} cols={4} />}>
        <StatsData searchParams={searchParams} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="By channel" subtitle="Where every queued notification is headed.">
          <Suspense fallback={<ChartSkeleton />}>
            <ChannelChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
        <ChartCard title="By status" subtitle="Delivered, failed, or still in flight.">
          <Suspense fallback={<ChartSkeleton />}>
            <StatusChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData({ searchParams }: { searchParams: SearchParams }) {
  const v = await getNotificationBuckets(await createdWhere(searchParams));
  const basis = "by queued date";
  // In flight is folded into the Total card's hint to keep the row at four.
  const items: AnalyticsStatCardItem[] = [
    {
      label: "Total queued",
      value: v.total,
      hint: `${v.inFlight} still in flight · ${basis}`,
      badge: "Queued",
      badgeTone: "neutral",
    },
    {
      label: "Delivered",
      value: v.sent,
      hint: `Sent with a message · ${basis}`,
      badge: "Sent",
      badgeTone: "ok",
    },
    {
      label: "Skipped (no template)",
      value: v.skipped,
      hint: `Marked sent without a message, no template · ${basis}`,
      badge: "Skipped",
      badgeTone: "neutral",
    },
    {
      label: "Failed",
      value: v.failed,
      hint: `Send failed · ${basis}`,
      tone: v.failed > 0 ? "warn" : undefined,
      badge: "Failed",
      badgeTone: v.failed > 0 ? "warn" : "neutral",
    },
  ];

  return <AnalyticsStatCards items={items} />;
}

async function ChannelChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await db
    .select({ channel: notificationOutbox.channel, n: intCount })
    .from(notificationOutbox)
    .where(await createdWhere(searchParams))
    .groupBy(notificationOutbox.channel);
  return <SegmentedBar withList parts={rows.map((r) => ({ label: r.channel, value: r.n }))} />;
}

async function StatusChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await db
    .select({ status: notificationOutbox.status, n: intCount })
    .from(notificationOutbox)
    .where(await createdWhere(searchParams))
    .groupBy(notificationOutbox.status);
  return <SegmentedBar withList parts={rows.map((r) => ({ label: r.status, value: r.n, tone: STATUS_TONE[r.status] ?? "chart" }))} />;
}
