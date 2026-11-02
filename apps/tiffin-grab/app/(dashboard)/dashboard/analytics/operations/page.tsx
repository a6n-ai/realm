import { Skeleton } from "@foundry/ui/skeleton";
import { cache, Suspense } from "react";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { calendarSkeletonHeight } from "@/lib/analytics/calendar-height";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { AnalyticsStatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { BreakdownBarChart, CalendarHeatmap, GaugeChart, PartsDonut } from "@/components/analytics/charts";
import { DELIVERY_TONE } from "@/components/analytics/status-tones";
import { isoDateInZone } from "@/lib/analytics/profitability";
import {
  getDeliveriesDaily,
  getDeliveryStatusMix,
  getOperationsStats,
  getRouteLoadByDriver,
} from "@/lib/services/analytics/operations.service";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { DATE_BASIS_LABEL, type AnalyticsScope } from "@/lib/services/analytics/metrics/scope";

const loadStats = cache((scope: AnalyticsScope) => getOperationsStats(scope));

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function OperationsAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const resolved = await scopeOrAlert("/dashboard/analytics/operations", await searchParams);
  if (!resolved.scope) return resolved.alert;
  const { scope } = resolved;
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard title="Deliveries calendar" subtitle="Deliveries per day" info={`Counted ${DATE_BASIS_LABEL.deliveries}. Hover a day to see scheduled, skipped and cancelled.`}>
          <Suspense fallback={<ChartSkeleton height={calendarSkeletonHeight(scope, false)} />}>
            <DeliveriesCalendar scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Route load per driver" subtitle="Deliveries synced from OptimoRoute" info={`Counted ${DATE_BASIS_LABEL.deliveries}.`}>
          <Suspense fallback={<ChartSkeleton />}>
            <DriverChart scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard title="What share of deliveries was skipped?" subtitle="Skipped out of all scheduled" info={`Counted ${DATE_BASIS_LABEL.deliveries}.`}>
          <Suspense fallback={<ChartSkeleton />}>
            <SkipRateChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Delivery status" subtitle="Every delivery in range" info={`Counted ${DATE_BASIS_LABEL.deliveries}.`}>
          <Suspense fallback={<ChartSkeleton />}>
            <StatusSplit scope={scope} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function SkipRateChart({ scope }: { scope: AnalyticsScope }) {
  const s = await loadStats(scope);
  const has = s.totalDeliveries > 0;
  return (
    <GaugeChart
      caption="skipped"
      value={s.skipped}
      total={s.totalDeliveries}
      tone="warning"
      footnote={has ? `${s.skipped.toLocaleString()} of ${s.totalDeliveries.toLocaleString()} deliveries skipped` : undefined}
      rows={[{ label: "Skipped", value: s.skipped, tone: "warning" }, { label: "Not skipped", value: s.totalDeliveries - s.skipped, tone: "muted" }]}
    />
  );
}

async function StatsData({ scope }: { scope: AnalyticsScope }) {
  const s = await loadStats(scope);
  return (
    <AnalyticsStatCards
      items={[
        { label: "Total deliveries", value: s.totalDeliveries, hint: `All deliveries in range, any status · ${DATE_BASIS_LABEL.deliveries}`, badge: "All statuses", badgeTone: "neutral" },
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

async function DeliveriesCalendar({ scope }: { scope: AnalyticsScope }) {
  const rows = await getDeliveriesDaily(scope);
  return (
    <CalendarHeatmap
      from={isoDateInZone(scope.fromMs, scope.tz)}
      to={isoDateInZone(scope.toMs, scope.tz)}
      label="Deliveries"
      days={rows.map((r) => ({
        date: r.iso,
        value: r.scheduled + r.paused + r.skipped + r.cancelled,
        breakdown: [
          { label: "Scheduled", value: r.scheduled },
          ...(r.paused > 0 ? [{ label: "Paused", value: r.paused }] : []),
          { label: "Skipped", value: r.skipped },
          { label: "Cancelled", value: r.cancelled },
        ],
      }))}
    />
  );
}

async function StatusSplit({ scope }: { scope: AnalyticsScope }) {
  const rows = await getDeliveryStatusMix(scope);
  return <PartsDonut caption="Deliveries" max={6} parts={rows.map((r) => ({ label: r.status, value: r.n, tone: DELIVERY_TONE[r.key] ?? "chart" }))} />;
}

async function DriverChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getRouteLoadByDriver(50, scope);
  return <BreakdownBarChart data={rows} xKey="driver" yKey="n" label="Stops" />;
}
