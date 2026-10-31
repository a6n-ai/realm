import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox } from "@/db/schema";
import { StatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { getNotificationBuckets } from "@/lib/services/analytics/notifications.service";
import { epochBoundsWhere, withDefaultMonth } from "@/lib/list/default-month";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownBarChart, DistributionDonutChart } from "@/components/analytics/charts";

const intCount = sql<number>`cast(count(*) as int)`;

// Single source of truth for the stat cards, in display order. StatsData maps
// these labels onto the queried values to build the StatGrid `items` array.
const STAT_CARDS = [
  { key: "total", label: "Total queued" },
  { key: "sent", label: "Delivered" },
  { key: "skipped", label: "Skipped (no template)" },
  { key: "failed", label: "Failed" },
  { key: "inFlight", label: "In flight" },
] as const;

type StatKey = (typeof STAT_CARDS)[number]["key"];

type SearchParams = Promise<Record<string, string | undefined>>;

async function createdWhere(searchParams: SearchParams) {
  return epochBoundsWhere(notificationOutbox.createdAt, await withDefaultMonth(await searchParams));
}

export default function NotificationAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<StatCardsSkeleton count={5} />}>
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
  const values: Record<StatKey, number> = await getNotificationBuckets(await createdWhere(searchParams));
  const items = STAT_CARDS.map((s) => ({ label: s.label, value: values[s.key] }));

  return <StatCards items={items} />;
}

async function ChannelChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await db
    .select({ channel: notificationOutbox.channel, n: intCount })
    .from(notificationOutbox)
    .where(await createdWhere(searchParams))
    .groupBy(notificationOutbox.channel);
  return <BreakdownBarChart data={rows} xKey="channel" yKey="n" />;
}

async function StatusChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await db
    .select({ status: notificationOutbox.status, n: intCount })
    .from(notificationOutbox)
    .where(await createdWhere(searchParams))
    .groupBy(notificationOutbox.status);
  return <DistributionDonutChart data={rows} nameKey="status" valueKey="n" />;
}
