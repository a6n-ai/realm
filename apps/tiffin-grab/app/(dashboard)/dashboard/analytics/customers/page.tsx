import { Suspense } from "react";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { calendarSkeletonHeight } from "@/lib/analytics/calendar-height";
import { calendarDays } from "@/lib/analytics/calendar-days";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { AnalyticsStatCards, AnalyticsStatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { BreakdownBarChart, CalendarHeatmap, PartsDonut, TrendLineChart } from "@/components/analytics/charts";
import { grainUnitForRange } from "@/lib/analytics/revenue";
import { ORDER_TONE } from "@/components/analytics/status-tones";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { ordersDrillHref } from "@/lib/analytics/drill";
import { DATE_BASIS_LABEL } from "@/lib/services/analytics/metrics/scope";
import { type AnalyticsScope } from "@/lib/analytics/scope-types";
import {
  getCustomerStats,
  getSignupDaily,
  getSignupTrend,
  getSubscriptionMix,
  getTopCities,
} from "@/lib/services/analytics/customers.service";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function CustomersAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const resolved = await scopeOrAlert("/dashboard/analytics/customers", await searchParams);
  if (!resolved.scope) return resolved.alert;
  const { scope } = resolved;
  const unit = grainUnitForRange(scope.fromMs, scope.toMs, scope.tz);
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsIntro description="Who is subscribed, who is paused, and where new accounts are coming from." />
      <Suspense fallback={<AnalyticsStatCardsSkeleton rows={1} />}>
        <StatsData scope={scope} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard title={`Signups by ${unit}`} subtitle="New customer accounts created" info={`${unit === "day" ? "Line is the 7-day average. " : ""}With a franchise or filter selected, only accounts with an order in scope are counted.`}>
          <Suspense fallback={<ChartSkeleton />}>
            <SignupChart scope={scope} daily={unit === "day"} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Signups calendar" subtitle="New accounts per day" info="Each day is the join time in Toronto — the same clock the customers list shows. Darker is more.">
          <Suspense fallback={<ChartSkeleton height={calendarSkeletonHeight(scope)} />}>
            <SignupCalendar scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard title="Subscription status" subtitle="Orders by status" info={`Counted ${DATE_BASIS_LABEL.orders}. Open a status to see those orders.`}>
          <Suspense fallback={<ChartSkeleton />}>
            <MixChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Top cities" subtitle="Customers by city, top 8 and the rest" info={`Counted ${DATE_BASIS_LABEL.orders}.`}>
          <Suspense fallback={<ChartSkeleton />}>
            <CitiesChart scope={scope} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData({ scope }: { scope: AnalyticsScope }) {
  const s = await getCustomerStats(scope);
  return (
    <AnalyticsStatCards
      items={[
        {
          label: "Customers",
          value: s.customers,
          hint: `With an order · ${DATE_BASIS_LABEL.orders}`,
          badge: "Accounts",
          badgeTone: "neutral",
        },
        {
          label: "Active customers",
          value: s.activeCustomers,
          hint: `Active plan created or running in range · ${DATE_BASIS_LABEL.orders}`,
          badge: "Active",
          badgeTone: "ok",
        },
        {
          label: "Paused customers",
          value: s.pausedToday,
          hint: "Active plan with a paused delivery · today",
          tone: s.pausedToday > 0 ? "warn" : undefined,
          badge: "Paused",
          badgeTone: s.pausedToday > 0 ? "warn" : "neutral",
        },
        {
          label: "Cancelled orders",
          value: s.cancelledOrders,
          hint: DATE_BASIS_LABEL.orders,
          href: ordersDrillHref(scope, { status: ["cancelled"] }),
          badge: "Cancelled",
          badgeTone: "neutral",
        },
      ]}
    />
  );
}

async function SignupChart({ scope, daily }: { scope: AnalyticsScope; daily: boolean }) {
  const rows = await getSignupTrend(scope);
  return <TrendLineChart data={rows} xKey="period" tipKey="tip" yKey="n" label="New accounts" average={daily} />;
}

async function SignupCalendar({ scope }: { scope: AnalyticsScope }) {
  const rows = await getSignupDaily(scope);
  return (
    <CalendarHeatmap
      {...calendarDays(scope)}
      label="New accounts"
      days={rows.map((r) => ({ date: r.iso, value: r.n }))}
    />
  );
}

async function MixChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getSubscriptionMix(scope);
  return <PartsDonut caption="Orders" max={6} parts={rows.map((r) => ({ label: r.status, value: r.n, tone: ORDER_TONE[r.key] ?? "chart", href: ordersDrillHref(scope, { status: [r.key] }) }))} />;
}

async function CitiesChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getTopCities(500, scope);
  return <BreakdownBarChart data={rows} xKey="city" yKey="n" label="Customers" />;
}
