import { getSession } from "@/lib/auth/session";
import { Suspense } from "react";
import { SkeletonStatCards } from "@/components/ds";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsPageHeader } from "@/components/analytics/analytics-page-header";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { MetricTiles } from "@/components/analytics/metric-tiles";
import { BreakdownBarChart, TrendLineChart } from "@/components/analytics/charts";
import { customersHref, ordersHref } from "@/lib/analytics/drill";
import {
  getCustomerStats,
  getSignupTrend,
  getSubscriptionMix,
  getTopCities,
} from "@/lib/services/analytics/customers.service";
import {
  parseAnalyticsFilters,
  type AnalyticsSearchParams,
} from "@/lib/services/analytics/shared-filters";

type SearchParams = Promise<AnalyticsSearchParams>;

export default function CustomersAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-5">
      <AnalyticsPageHeader
        section="Customers"
        description="Who is subscribed, who is paused, and where new accounts are coming from."
        action={
          <Suspense fallback={<div className="bg-muted/40 h-7 w-28 animate-pulse rounded-full" />}>
            <AnalyticsLiveStamp />
          </Suspense>
        }
      />
      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <StatsData searchParams={searchParams} />
      </Suspense>

      <ChartCard title="Signups over time" subtitle="New customer accounts created in this range.">
        <Suspense fallback={<ChartSkeleton />}>
          <SignupChart searchParams={searchParams} />
        </Suspense>
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Subscription status mix" subtitle="Open a status to see those orders.">
          <Suspense fallback={<ChartSkeleton />}>
            <MixChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Top cities" subtitle="Customers grouped by city.">
          <Suspense fallback={<ChartSkeleton />}>
            <CitiesChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData({ searchParams }: { searchParams: SearchParams }) {
  const s = await getCustomerStats(await parseAnalyticsFilters(await searchParams, await getSession()));
  return (
    <MetricTiles
      cols={4}
      items={[
        {
          label: "Total customers",
          value: s.totalCustomers,
          href: customersHref(),
          badge: "Accounts",
          badgeTone: "neutral",
        },
        {
          label: "Active subscriptions",
          value: s.activeSubscriptions,
          href: ordersHref({ status: "active" }),
          badge: "Active",
          badgeTone: "ok",
        },
        {
          label: "Paused now",
          value: s.pausedNow,
          hint: "Open pause windows. Opens orders marked paused.",
          href: ordersHref({ status: "paused" }),
          tone: s.pausedNow > 0 ? "warn" : "default",
          badge: "Paused",
          badgeTone: s.pausedNow > 0 ? "warn" : "neutral",
        },
        {
          label: "Cancelled (ever)",
          value: s.cancelledEver,
          href: ordersHref({ status: "cancelled" }),
          badge: "Cancelled",
          badgeTone: "neutral",
        },
      ]}
    />
  );
}

async function SignupChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getSignupTrend(await parseAnalyticsFilters(await searchParams, await getSession()));
  return <TrendLineChart data={rows} xKey="day" yKey="n" />;
}

async function MixChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getSubscriptionMix(await parseAnalyticsFilters(await searchParams, await getSession()));
  return (
    <BreakdownList
      rows={rows.map((r) => ({
        label: r.status,
        n: r.n,
        href: ordersHref({ status: r.key }),
      }))}
      emptyLabel="No subscriptions yet."
    />
  );
}

async function CitiesChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getTopCities(8, await parseAnalyticsFilters(await searchParams, await getSession()));
  return <BreakdownBarChart data={rows} xKey="city" yKey="n" />;
}
