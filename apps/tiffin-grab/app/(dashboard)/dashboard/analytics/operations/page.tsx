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
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { DATE_BASIS_LABEL, type AnalyticsScope } from "@/lib/services/analytics/metrics/scope";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function OperationsAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const resolved = await scopeOrAlert("/dashboard/analytics/operations", await searchParams);
  if (!resolved.scope) return resolved.alert;
  const { scope } = resolved;
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
        <StatsData scope={scope} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Delivery status mix" subtitle={`Each status · ${DATE_BASIS_LABEL.deliveries}`}>
          <Suspense fallback={<ChartSkeleton />}>
            <MixChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Route load per driver" subtitle={`Deliveries synced from OptimoRoute · ${DATE_BASIS_LABEL.deliveries}`}>
          <Suspense fallback={<ChartSkeleton />}>
            <DriverChart scope={scope} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData({ scope }: { scope: AnalyticsScope }) {
  const s = await getOperationsStats(scope);
  return (
    <MetricTiles
      cols={4}
      items={[
        { label: "Total deliveries", value: s.totalDeliveries, hint: DATE_BASIS_LABEL.deliveries, badge: "Scheduled", badgeTone: "neutral" },
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

async function MixChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getDeliveryStatusMix(scope);
  return <DistributionDonutChart data={rows} nameKey="status" valueKey="n" />;
}

async function DriverChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getRouteLoadByDriver(10, scope);
  return <BreakdownBarChart data={rows} xKey="driver" yKey="n" />;
}
