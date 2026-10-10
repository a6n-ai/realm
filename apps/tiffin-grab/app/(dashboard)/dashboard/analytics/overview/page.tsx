import { Suspense } from "react";
import { SkeletonStatCards } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { MetricTiles } from "@/components/analytics/metric-tiles";
import { DistributionDonutChart, TrendLineChart } from "@/components/analytics/charts";
import { complaintHref, parseComplaintFilters } from "@/lib/services/analytics/complaint-filters";
import { ordersHref, paymentsHref, zonedRangeMs } from "@/lib/analytics/drill";
import { SETTLED_STATUSES } from "@/lib/analytics/revenue";
import type { RevenueCohortSlice } from "@/lib/analytics/revenue-cohorts";
import { currentMonth } from "@/lib/analytics/profitability";
import { getRevenueReport, getRevenueCohortMix, parseRevenueFilters } from "@/lib/services/analytics/revenue.service";
import { getCustomerStats } from "@/lib/services/analytics/customers.service";
import { getComplaintKpis } from "@/lib/services/analytics/complaints.service";
import { getProfitabilityReport } from "@/lib/services/analytics/profitability.service";
import { getTrialToPlanConversion } from "@/lib/services/analytics/overview.service";
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
      <Suspense fallback={<SkeletonStatCards count={7} />}>
        <StatsData searchParams={searchParams} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Net sales" subtitle="Settled payments excluding tax, by day">
          <Suspense fallback={<ChartSkeleton />}>
            <RevenueChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
        <ChartCard
          title="Revenue mix"
          subtitle="Settled net sales by renewals, new plans, and trials"
        >
          <Suspense fallback={<ChartSkeleton />}>
            <CohortChart searchParams={searchParams} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

function analyticsHref(path: string, sp: AnalyticsSearchParams): string {
  const qs = new URLSearchParams();
  for (const key of ["from", "to", "plan", "mealSize", "zone"] as const) {
    const v = sp[key];
    if (v) qs.set(key, v);
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

async function StatsData({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filters = await parseAnalyticsFilters(sp);
  const revenueFilters = parseRevenueFilters(sp);
  const { timezone } = await getAppSettings();
  const [revenue, customers, complaints, profit, trialConv] = await Promise.all([
    getRevenueReport(revenueFilters),
    getCustomerStats(filters),
    getComplaintKpis(parseComplaintFilters(sp)),
    getProfitabilityReport({
      month: currentMonth(timezone),
      grain: "daily",
      filters,
    }),
    getTrialToPlanConversion(filters),
  ]);
  const range = zonedRangeMs(revenue.from, revenue.to, timezone);
  const paid = paymentsHref({ statuses: SETTLED_STATUSES, fromMs: range.from, toMs: range.to });
  const complaintFilters = parseComplaintFilters(sp);

  return (
    <MetricTiles
      cols={4}
      items={[
        {
          label: "Net sales",
          value: money(revenue.kpis.netSales),
          hint: "Paid amounts, excluding tax",
          href: paid,
        },
        {
          label: "Discounts",
          value: money(revenue.kpis.discounts),
          hint:
            revenue.kpis.discountRatePct == null
              ? "No sales in range"
              : `${revenue.kpis.discountRatePct}% of gross sales`,
          href: analyticsHref("/dashboard/analytics/revenue", sp),
        },
        {
          label: "Net profit",
          value: money(profit.kpis.profit),
          hint: "Under current cost assumptions",
          href: analyticsHref("/dashboard/analytics/profitability", sp),
          tone: profit.kpis.profit < 0 ? "bad" : "default",
        },
        {
          label: "Active subscriptions",
          value: customers.activeSubscriptions,
          href: ordersHref({ status: "active" }),
        },
        {
          label: "Trial → Plan",
          value: trialConv.conversionRatePct == null ? "—" : `${trialConv.conversionRatePct}%`,
          hint:
            trialConv.eligible === 0
              ? `No trials ended in range`
              : `${trialConv.converted} of ${trialConv.eligible} trials · ${trialConv.windowDays}d window`,
          href: analyticsHref("/dashboard/analytics/customers", sp),
        },
        {
          label: "Open tickets",
          value: complaints.open,
          href: complaintHref("/dashboard/tickets", {
            ...complaintFilters,
            statuses: ["open", "in_progress", "waiting_on_customer"],
          }),
        },
        {
          label: "Total tickets",
          value: complaints.total,
          hint: "Complaints in this range",
          href: complaintHref("/dashboard/tickets", complaintFilters),
        },
      ]}
    />
  );
}

async function RevenueChart({ searchParams }: { searchParams: SearchParams }) {
  const report = await getRevenueReport(parseRevenueFilters(await searchParams));
  return <TrendLineChart data={report.trend} xKey="period" yKey="netSales" format="currency" />;
}

async function CohortChart({ searchParams }: { searchParams: SearchParams }) {
  const { slices } = await getRevenueCohortMix(parseRevenueFilters(await searchParams));
  const chartRows = slices.filter((s) => s.amount > 0);
  return (
    <div className="space-y-3">
      <DistributionDonutChart
        data={chartRows}
        nameKey="label"
        valueKey="amount"
        colorKey="color"
        format="currency"
      />
      <CohortLegend slices={slices} />
    </div>
  );
}

function CohortLegend({ slices }: { slices: RevenueCohortSlice[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {slices.map((s) => (
        <li key={s.key} className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
          <span className="text-muted-foreground flex-1">{s.label}</span>
          <span className="tabular-nums">{money(s.amount)}</span>
          <span className="text-muted-foreground w-14 text-right tabular-nums">
            {s.count} {s.count === 1 ? "order" : "orders"}
          </span>
        </li>
      ))}
    </ul>
  );
}
