import { Suspense } from "react";
import { notificationOutbox } from "@/db/schema";
import { AnalyticsStatCards, AnalyticsStatCardsSkeleton, type AnalyticsStatCardItem } from "@/components/dashboard/stat-cards";
import { getChannelCounts, getNotificationBuckets, getStatusCounts } from "@/lib/services/analytics/notifications.service";
import { epochBoundsWhere, withDefaultMonth } from "@/lib/list/default-month";
import { notificationLogsHref } from "@/lib/notifications/outcome";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { PartsDonut, SegmentedBar } from "@/components/analytics/charts";
import type { Tone } from "@/components/analytics/chart-math";

const STATUS_TONE: Record<string, Tone> = { sent: "success", failed: "destructive", skipped: "muted" };

type SearchParams = Promise<Record<string, string | undefined>>;

async function createdWhere(searchParams: SearchParams) {
  return epochBoundsWhere(notificationOutbox.createdAt, await withDefaultMonth(await searchParams));
}

export default function NotificationAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<AnalyticsStatCardsSkeleton rows={1} />}>
        <StatsData searchParams={searchParams} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
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
  const sp = await withDefaultMonth(await searchParams);
  const v = await getNotificationBuckets(epochBoundsWhere(notificationOutbox.createdAt, sp));
  const basis = "by queued date";
  const href = notificationLogsHref(sp);
  // In flight is folded into the Total card's hint to keep the row at four.
  const items: AnalyticsStatCardItem[] = [
    {
      label: "Total queued",
      value: v.total,
      hint: `${v.inFlight} still in flight · ${basis}`,
      href,
      badge: "Queued",
      badgeTone: "neutral",
    },
    {
      label: "Delivered",
      value: v.sent,
      hint: `Sent with a message · ${basis}`,
      href: notificationLogsHref(sp, "delivered"),
      badge: "Sent",
      badgeTone: "ok",
    },
    {
      label: "Skipped (no template)",
      value: v.skipped,
      hint: `Marked sent without a message, no template · ${basis}`,
      href: notificationLogsHref(sp, "skipped"),
      badge: "Skipped",
      badgeTone: "neutral",
    },
    {
      label: "Failed",
      value: v.failed,
      hint: `Send failed · ${basis}`,
      href: notificationLogsHref(sp, "failed"),
      tone: v.failed > 0 ? "warn" : undefined,
      badge: "Failed",
      badgeTone: v.failed > 0 ? "warn" : "neutral",
    },
  ];

  return <AnalyticsStatCards items={items} />;
}

async function ChannelChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getChannelCounts(await createdWhere(searchParams));
  return <SegmentedBar withList parts={rows.map((r) => ({ label: r.channel, value: r.n }))} />;
}

async function StatusChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getStatusCounts(await createdWhere(searchParams));
  return <PartsDonut caption="Notifications" parts={rows.map((r) => ({ label: r.status, value: r.n, tone: STATUS_TONE[r.status] ?? "chart" }))} />;
}
