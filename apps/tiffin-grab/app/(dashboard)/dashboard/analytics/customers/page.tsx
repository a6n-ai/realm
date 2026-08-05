import { Suspense } from "react";
import { StatGrid, SkeletonStatCards } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownBarChart, DistributionDonutChart, TrendLineChart } from "@/components/analytics/charts";
import {
  getCustomerStats,
  getSignupTrend,
  getSubscriptionMix,
  getTopCities,
} from "@/lib/services/analytics/customers.service";

export default function CustomersAnalyticsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <StatsData />
      </Suspense>

      <ChartCard title="Signups over time">
        <Suspense fallback={<ChartSkeleton />}>
          <SignupChart />
        </Suspense>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Subscription status mix">
          <Suspense fallback={<ChartSkeleton />}>
            <MixChart />
          </Suspense>
        </ChartCard>
        <ChartCard title="Top cities">
          <Suspense fallback={<ChartSkeleton />}>
            <CitiesChart />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData() {
  const s = await getCustomerStats();
  return (
    <StatGrid
      cols={4}
      items={[
        { label: "Total customers", value: s.totalCustomers },
        { label: "Active subscriptions", value: s.activeSubscriptions },
        { label: "Paused now", value: s.pausedNow },
        { label: "Cancelled (ever)", value: s.cancelledEver },
      ]}
    />
  );
}

async function SignupChart() {
  const rows = await getSignupTrend();
  return <TrendLineChart data={rows} xKey="day" yKey="n" />;
}

async function MixChart() {
  const rows = await getSubscriptionMix();
  return <DistributionDonutChart data={rows} nameKey="status" valueKey="n" />;
}

async function CitiesChart() {
  const rows = await getTopCities();
  return <BreakdownBarChart data={rows} xKey="city" yKey="n" />;
}
