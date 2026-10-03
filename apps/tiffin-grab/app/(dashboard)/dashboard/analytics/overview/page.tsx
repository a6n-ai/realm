import { cache, Suspense } from "react";
import { SkeletonStatCards } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { MetricTiles } from "@/components/analytics/metric-tiles";
import { DistributionDonutChart, TrendLineChart } from "@/components/analytics/charts";
import { complaintHref } from "@/lib/services/analytics/complaint-filters";
import { inquiriesHref, ordersHref, paymentsHref, zonedRangeMs } from "@/lib/analytics/drill";
import { SETTLED_STATUSES } from "@/lib/analytics/revenue";
import { getLeadStats } from "@/lib/services/analytics/leads.service";
import { getRevenueReport } from "@/lib/services/analytics/revenue.service";
import { getCustomerStats, getSubscriptionMix } from "@/lib/services/analytics/customers.service";
import { getComplaintStats } from "@/lib/services/analytics/complaints.service";
import { getOperationsStats } from "@/lib/services/analytics/operations.service";
import { getAppSettings } from "@/lib/services/app-settings.service";

function money(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

const loadMonthToDate = cache(() => getRevenueReport({ methods: [] }));

export default function OverviewAnalyticsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={5} />}>
        <StatsData />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Net sales this month" subtitle="Settled payments excluding tax, by day">
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
  const [leads, revenue, customers, complaints, operations, { timezone }] = await Promise.all([
    getLeadStats(),
    loadMonthToDate(),
    getCustomerStats(),
    getComplaintStats(),
    getOperationsStats(),
    getAppSettings(),
  ]);
  const range = zonedRangeMs(revenue.from, revenue.to, timezone);
  return (
    <MetricTiles
      cols={4}
      items={[
        {
          label: "Net sales (month to date)",
          value: money(revenue.kpis.netSales),
          hint: "Paid amounts, excluding tax",
          href: paymentsHref({ statuses: SETTLED_STATUSES, fromMs: range.from, toMs: range.to }),
        },
        {
          label: "Active subscriptions",
          value: customers.activeSubscriptions,
          href: ordersHref({ status: "active" }),
        },
        {
          label: "Lead conversion",
          value: `${leads.conversionRatePct}%`,
          hint: `${leads.converted} of ${leads.total} leads`,
          href: inquiriesHref(),
        },
        {
          label: "Open tickets",
          value: complaints.open,
          href: complaintHref("/dashboard/tickets", {
            statuses: ["open", "in_progress", "waiting_on_customer"],
          }),
        },
        {
          label: "Delivery skip rate",
          value: `${operations.skipRatePct}%`,
          hint: `${operations.skipped} skipped of ${operations.totalDeliveries}`,
        },
      ]}
    />
  );
}

async function RevenueChart() {
  const report = await loadMonthToDate();
  return <TrendLineChart data={report.trend} xKey="period" yKey="netSales" />;
}

async function SubscriptionChart() {
  const rows = await getSubscriptionMix();
  return <DistributionDonutChart data={rows} nameKey="status" valueKey="n" />;
}
