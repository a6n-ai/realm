import { Suspense } from "react";
import { StatGrid, SkeletonStatCards } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { DistributionDonutChart, TrendLineChart } from "@/components/analytics/charts";
import { getLeadStats } from "@/lib/services/analytics/leads.service";
import { getRevenueStats, getRevenueTrend } from "@/lib/services/analytics/revenue.service";
import { getCustomerStats, getSubscriptionMix } from "@/lib/services/analytics/customers.service";
import { getComplaintStats } from "@/lib/services/analytics/complaints.service";
import { getOperationsStats } from "@/lib/services/analytics/operations.service";

function money(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

export default function OverviewAnalyticsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={5} />}>
        <StatsData />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Revenue over time" subtitle="Captured payments, by day">
          <Suspense fallback={<ChartSkeleton />}>
            <RevenueChart />
          </Suspense>
        </ChartCard>
        <ChartCard title="Subscription status mix">
          <Suspense fallback={<ChartSkeleton />}>
            <SubscriptionChart />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData() {
  const [leads, revenue, customers, complaints, operations] = await Promise.all([
    getLeadStats(),
    getRevenueStats(),
    getCustomerStats(),
    getComplaintStats(),
    getOperationsStats(),
  ]);
  return (
    <StatGrid
      cols={5}
      items={[
        { label: "Net revenue", value: money(revenue.net) },
        { label: "Active subscriptions", value: customers.activeSubscriptions },
        { label: "Lead conversion", value: `${leads.conversionRatePct}%` },
        { label: "Open tickets", value: complaints.open },
        { label: "Delivery skip rate", value: `${operations.skipRatePct}%` },
      ]}
    />
  );
}

async function RevenueChart() {
  const rows = await getRevenueTrend();
  return <TrendLineChart data={rows} xKey="day" yKey="amount" />;
}

async function SubscriptionChart() {
  const rows = await getSubscriptionMix();
  return <DistributionDonutChart data={rows} nameKey="status" valueKey="n" />;
}
