import { Suspense } from "react";
import { SkeletonStatCards } from "@/components/ds";
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
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <StatsData searchParams={searchParams} />
      </Suspense>

      <ChartCard title="Signups over time">
        <Suspense fallback={<ChartSkeleton />}>
          <SignupChart searchParams={searchParams} />
        </Suspense>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Subscription status mix">
          <Suspense fallback={<ChartSkeleton />}>
            <MixChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Top cities">
          <Suspense fallback={<ChartSkeleton />}>
            <CitiesChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData({ searchParams }: { searchParams: SearchParams }) {
  const s = await getCustomerStats(parseAnalyticsFilters(await searchParams));
  return (
    <MetricTiles
      cols={4}
      items={[
        { label: "Total customers", value: s.totalCustomers, href: customersHref() },
        { label: "Active subscriptions", value: s.activeSubscriptions, href: ordersHref({ status: "active" }) },
        {
          label: "Paused now",
          value: s.pausedNow,
          hint: "Open pause windows. Opens orders marked paused.",
          href: ordersHref({ status: "paused" }),
        },
        { label: "Cancelled (ever)", value: s.cancelledEver, href: ordersHref({ status: "cancelled" }) },
      ]}
    />
  );
}

async function SignupChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getSignupTrend(parseAnalyticsFilters(await searchParams));
  return <TrendLineChart data={rows} xKey="day" yKey="n" />;
}

async function MixChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getSubscriptionMix(parseAnalyticsFilters(await searchParams));
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
  const rows = await getTopCities(8, parseAnalyticsFilters(await searchParams));
  return <BreakdownBarChart data={rows} xKey="city" yKey="n" />;
}
