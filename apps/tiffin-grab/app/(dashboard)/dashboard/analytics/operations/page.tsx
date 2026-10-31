import { Skeleton } from "@foundry/ui/skeleton";
import { cache, Suspense } from "react";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { AnalyticsStatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { BreakdownBarChart, RadialRateChart, StackedBarChart } from "@/components/analytics/charts";
import {
  getDeliveriesByDay,
  getOperationsStats,
  getRouteLoadByDriver,
} from "@/lib/services/analytics/operations.service";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { grainUnitForRange } from "@/lib/analytics/revenue";
import { DATE_BASIS_LABEL, type AnalyticsScope } from "@/lib/services/analytics/metrics/scope";

const loadStats = cache((scope: AnalyticsScope) => getOperationsStats(scope));

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function OperationsAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const resolved = await scopeOrAlert("/dashboard/analytics/operations", await searchParams);
  if (!resolved.scope) return resolved.alert;
  const { scope } = resolved;
  const unit = grainUnitForRange(scope.fromMs, scope.toMs, scope.tz);
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsIntro
        description="Deliveries by status, and how many stops each driver is carrying."
        action={
          <Suspense fallback={<Skeleton className="h-6 w-28 rounded-full" />}>
            <AnalyticsLiveStamp />
          </Suspense>
        }
      />
      <Suspense fallback={<StatCardsSkeleton count={4} cols={4} />}>
        <StatsData scope={scope} />
      </Suspense>

      <ChartCard title={`Deliveries by ${unit}`} subtitle={`Each status · ${DATE_BASIS_LABEL.deliveries}. Hover a bar for that ${unit}.`}>
        <Suspense fallback={<ChartSkeleton />}>
          <DeliveriesChart scope={scope} />
        </Suspense>
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Route load per driver" subtitle={`Deliveries synced from OptimoRoute · ${DATE_BASIS_LABEL.deliveries}`}>
          <Suspense fallback={<ChartSkeleton />}>
            <DriverChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="What share of deliveries was skipped?" subtitle={`Skipped out of all scheduled · ${DATE_BASIS_LABEL.deliveries}`}>
          <Suspense fallback={<ChartSkeleton />}>
            <SkipRateChart scope={scope} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function SkipRateChart({ scope }: { scope: AnalyticsScope }) {
  const s = await loadStats(scope);
  const data = s.totalDeliveries === 0 ? [] : [{ label: "Skip rate", rate: s.skipRatePct }];
  return (
    <div className="flex flex-col gap-3">
      <RadialRateChart data={data} nameKey="label" valueKey="rate" caption="skipped" />
      {s.totalDeliveries > 0 ? (
        <p className="text-muted-foreground text-center text-sm">
          <span className="text-foreground font-semibold tabular-nums">
            {s.skipped.toLocaleString()} of {s.totalDeliveries.toLocaleString()}
          </span>{" "}
          deliveries skipped
        </p>
      ) : null}
    </div>
  );
}

async function StatsData({ scope }: { scope: AnalyticsScope }) {
  const s = await loadStats(scope);
  return (
    <AnalyticsStatCards
      items={[
        { label: "Total deliveries", value: s.totalDeliveries, hint: `Scheduled deliveries in range · ${DATE_BASIS_LABEL.deliveries}`, badge: "Scheduled", badgeTone: "neutral" },
        {
          label: "Skipped",
          value: s.skipped,
          hint: `Held or skipped by the customer · ${DATE_BASIS_LABEL.deliveries}`,
          tone: s.skipped > 0 ? "warn" : undefined,
          badge: "Skipped",
          badgeTone: s.skipped > 0 ? "warn" : "neutral",
        },
        {
          label: "Cancelled",
          value: s.cancelled,
          hint: `Cancelled before going out · ${DATE_BASIS_LABEL.deliveries}`,
          tone: s.cancelled > 0 ? "warn" : undefined,
          badge: "Cancelled",
          badgeTone: s.cancelled > 0 ? "warn" : "neutral",
        },
        { label: "Skip rate", value: `${s.skipRatePct}%`, hint: `Skipped deliveries divided by all deliveries · ${DATE_BASIS_LABEL.deliveries}`, badge: "Rate", badgeTone: "brand" },
      ]}
    />
  );
}

async function DeliveriesChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getDeliveriesByDay(scope);
  const paused = rows.some((r) => r.paused > 0);
  return (
    <StackedBarChart
      data={rows}
      xKey="period"
      tipKey="tip"
      series={[
        { key: "scheduled", label: "Scheduled", tone: "success" },
        ...(paused ? [{ key: "paused", label: "Paused", tone: "muted" as const }] : []),
        { key: "skipped", label: "Skipped", tone: "warning" },
        { key: "cancelled", label: "Cancelled", tone: "destructive" },
      ]}
    />
  );
}

async function DriverChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getRouteLoadByDriver(50, scope);
  return <BreakdownBarChart data={rows} xKey="driver" yKey="n" label="Stops" />;
}
