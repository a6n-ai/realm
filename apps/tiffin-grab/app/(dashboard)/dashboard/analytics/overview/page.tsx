import { Suspense } from "react";
import { SkeletonStatCards } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { MetricTiles } from "@/components/analytics/metric-tiles";
import { DistributionDonutChart, TrendLineChart } from "@/components/analytics/charts";
import { complaintHref, parseComplaintFilters } from "@/lib/services/analytics/complaint-filters";
import { inquiriesHref, ordersHref, paymentsHref, zonedRangeMs } from "@/lib/analytics/drill";
import { SETTLED_STATUSES } from "@/lib/analytics/revenue";
import { getLeadStats } from "@/lib/services/analytics/leads.service";
import { getRevenueReport, parseRevenueFilters } from "@/lib/services/analytics/revenue.service";
import { getCustomerStats, getSubscriptionMix } from "@/lib/services/analytics/customers.service";
import { getComplaintKpis } from "@/lib/services/analytics/complaints.service";
import { getOperationsStats } from "@/lib/services/analytics/operations.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import {
  parseAnalyticsFilters,
  type AnalyticsSearchParams,
} from "@/lib/services/analytics/shared-filters";

function money(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

type SearchParams = Promise<AnalyticsSearchParams>;

export default function OverviewAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={5} />}>
        <StatsData searchParams={searchParams} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Net sales" subtitle="Settled payments excluding tax, by day">
          <Suspense fallback={<ChartSkeleton />}>
            <RevenueChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Subscription status mix">
          <Suspense fallback={<ChartSkeleton />}>
            <SubscriptionChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filters = parseAnalyticsFilters(sp);
  const [leads, revenue, customers, complaints, operations, { timezone }] = await Promise.all([
    getLeadStats(filters),
    getRevenueReport(parseRevenueFilters(sp)),
    getCustomerStats(filters),
    getComplaintKpis(parseComplaintFilters(sp)),
    getOperationsStats(filters),
    getAppSettings(),
  ]);
  const range = zonedRangeMs(revenue.from, revenue.to, timezone);
  return (
    <MetricTiles
      cols={4}
      items={[
        {
          label: "Net sales",
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
            ...parseComplaintFilters(sp),
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

async function RevenueChart({ searchParams }: { searchParams: SearchParams }) {
  const report = await getRevenueReport(parseRevenueFilters(await searchParams));
  return <TrendLineChart data={report.trend} xKey="period" yKey="netSales" />;
}

async function SubscriptionChart({ searchParams }: { searchParams: SearchParams }) {
  const rows = await getSubscriptionMix(parseAnalyticsFilters(await searchParams));
  return <DistributionDonutChart data={rows} nameKey="status" valueKey="n" />;
}
