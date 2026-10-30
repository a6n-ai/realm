import { getSession } from "@/lib/auth/session";
import { Suspense } from "react";
import { SkeletonStatCards } from "@/components/ds";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsPageHeader } from "@/components/analytics/analytics-page-header";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { MetricTiles } from "@/components/analytics/metric-tiles";
import { BreakdownBarChart, DistributionDonutChart } from "@/components/analytics/charts";
import {
  getOperationsStats,
  getDeliveryStatusMix,
  getRouteLoadByDriver,
} from "@/lib/services/analytics/operations.service";
import {
  parseAnalyticsFilters,
  type AnalyticsSearchParams,
} from "@/lib/services/analytics/shared-filters";

type SearchParams = Promise<AnalyticsSearchParams>;

export default function OperationsAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-5">
      <AnalyticsPageHeader
        section="Operations"
        description="Deliveries by status, and how many stops each driver is carrying."
        action={
          <Suspense fallback={<div className="bg-muted/40 h-7 w-28 animate-pulse rounded-full" />}>
            <AnalyticsLiveStamp />
          </Suspense>
        }
      />
      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <StatsData searchParams={searchParams} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Delivery status mix" subtitle="Each status in this range.">
          <Suspense fallback={<ChartSkeleton />}>
            <MixChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Route load per driver" subtitle="Deliveries synced from OptimoRoute">
          <Suspense fallback={<ChartSkeleton />}>
            <DriverChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData({ searchParams }: { searchParams: SearchParams }) {
  const s = await getOperationsStats(await parseAnalyticsFilters(await searchParams, await getSession()));
  return (
    <MetricTiles
      cols={4}
      items={[
        { label: "Total deliveries", value: s.totalDeliveries, badge: "Scheduled", badgeTone: "neutral" },
        {
          label: "Skipped",
          value: s.skipped,
          tone: s.skipped > 0 ? "warn" : "default",
          badge: "Skipped",
          badgeTone: s.skipped > 0 ? "warn" : "neutral",
        },
        {
          label: "Cancelled",
          value: s.cancelled,
          tone: s.cancelled > 0 ? "warn" : "default",
          badge: "Cancelled",
          badgeTone: s.cancelled > 0 ? "warn" : "neutral",
        },
        { label: "Skip rate", value: `${s.skipRatePct}%`, badge: "Rate", badgeTone: "brand" },
      ]}
    />
  );
}

async function MixChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getDeliveryStatusMix(await parseAnalyticsFilters(await searchParams, await getSession()));
  return <DistributionDonutChart data={rows} nameKey="status" valueKey="n" />;
}

async function DriverChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getRouteLoadByDriver(10, await parseAnalyticsFilters(await searchParams, await getSession()));
  return <BreakdownBarChart data={rows} xKey="driver" yKey="n" />;
}
