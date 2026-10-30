import { getSession } from "@/lib/auth/session";
import { cache, Suspense } from "react";
import { SkeletonStatCards } from "@/components/ds";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsPageHeader } from "@/components/analytics/analytics-page-header";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { MetricFootnote, MetricTiles } from "@/components/analytics/metric-tiles";
import { DistributionDonutChart, TrendLineChart } from "@/components/analytics/charts";
import { complaintHref, parseComplaintFilters } from "@/lib/services/analytics/complaint-filters";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { ordersHref, paymentsHref } from "@/lib/analytics/drill";
import { SETTLED_STATUSES } from "@/lib/analytics/revenue";
import type { RevenueCohortSlice } from "@/lib/analytics/revenue-cohorts";
import { currentMonth } from "@/lib/analytics/profitability";
import { getRevenueReport, getRevenueCohortMix } from "@/lib/services/analytics/revenue.service";
import { getCustomerStats } from "@/lib/services/analytics/customers.service";
import { getComplaintKpis } from "@/lib/services/analytics/complaints.service";
import { getProfitabilityReport } from "@/lib/services/analytics/profitability.service";
import { getTrialToPlanConversion } from "@/lib/services/analytics/overview.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { DATE_BASIS_LABEL, type AnalyticsScope } from "@/lib/services/analytics/metrics/scope";
import {
  parseAnalyticsFilters,
  type AnalyticsSearchParams,
} from "@/lib/services/analytics/shared-filters";

function money(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

type SearchParams = Promise<AnalyticsSearchParams>;

const loadReport = cache((scope: AnalyticsScope) => getRevenueReport(scope));

export default async function OverviewAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const resolved = await scopeOrAlert("/dashboard/analytics/overview", sp);
  if (!resolved.scope) return resolved.alert;
  const { scope } = resolved;
  return (
    <div className="flex flex-col gap-5">
      <AnalyticsPageHeader
        section="Overview"
        description="Sales, profit, customers, and tickets for the selected range."
        action={
          <Suspense fallback={<div className="bg-muted/40 h-7 w-28 animate-pulse rounded-full" />}>
            <AnalyticsLiveStamp />
          </Suspense>
        }
      />

      <Suspense fallback={<SkeletonStatCards count={7} />}>
        <StatsData sp={sp} scope={scope} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Net revenue" subtitle={`Ex tax & surcharge, after refunds, by day · ${DATE_BASIS_LABEL.money}`}>
          <Suspense fallback={<ChartSkeleton />}>
            <RevenueChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard
          title="Revenue mix"
          subtitle={`Net revenue by renewals, new plans, and trials · ${DATE_BASIS_LABEL.money}`}
        >
          <Suspense fallback={<ChartSkeleton />}>
            <CohortChart scope={scope} />
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

async function StatsData({ sp, scope }: { sp: AnalyticsSearchParams; scope: AnalyticsScope }) {
  const filters = await parseAnalyticsFilters(sp, await getSession());
  const { timezone } = await getAppSettings();
  const [revenue, customers, complaints, profit, trialConv] = await Promise.all([
    loadReport(scope),
    getCustomerStats(filters),
    getComplaintKpis(parseComplaintFilters(sp)),
    getProfitabilityReport({
      month: currentMonth(timezone),
      grain: "daily",
      filters,
    }),
    getTrialToPlanConversion(filters),
  ]);
  const paid = paymentsHref({ statuses: SETTLED_STATUSES, methods: scope.extra.method, fromMs: scope.fromMs, toMs: scope.toMs });
  const complaintFilters = parseComplaintFilters(sp);

  return (
    <MetricTiles
      cols={4}
      items={[
        {
          label: "Net revenue",
          value: money(revenue.kpis.netRevenue),
          hint: `${DATE_BASIS_LABEL.money} · ex tax & surcharge`,
          href: paid,
          badge: "Settled",
          badgeTone: "neutral",
        },
        {
          label: "Discounts",
          value: money(revenue.kpis.discounts),
          hint: revenue.kpis.discountRatePct == null ? "No sales in range" : `Taken off list price · ${DATE_BASIS_LABEL.money}`,
          href: analyticsHref("/dashboard/analytics/revenue", sp),
          badge: "Given",
          badgeTone: "brand",
          footer:
            revenue.kpis.discountRatePct == null ? undefined : (
              <MetricFootnote>
                <span className="text-muted-foreground">Share of list price</span>
                <span className="text-foreground font-semibold tabular-nums">{revenue.kpis.discountRatePct}%</span>
              </MetricFootnote>
            ),
        },
        {
          label: "Net profit",
          value: money(profit.kpis.profit),
          hint: "Under current cost assumptions",
          href: analyticsHref("/dashboard/analytics/profitability", sp),
          tone: profit.kpis.profit < 0 ? "bad" : "ok",
          badge: profit.kpis.profit < 0 ? "Below target" : "Net",
          badgeTone: profit.kpis.profit < 0 ? "warn" : "ok",
        },
        {
          label: "Active subscriptions",
          value: customers.activeSubscriptions,
          href: ordersHref({ status: "active" }),
          badge: "Active",
          badgeTone: "ok",
        },
        {
          label: "Trial → Plan",
          value: trialConv.conversionRatePct == null ? "—" : `${trialConv.conversionRatePct}%`,
          hint:
            trialConv.eligible === 0
              ? "No trials ended in range"
              : `${trialConv.windowDays}-day window after the trial ends`,
          href: analyticsHref("/dashboard/analytics/customers", sp),
          badge: "Conversion",
          badgeTone: "brand",
          footer:
            trialConv.eligible === 0 ? undefined : (
              <MetricFootnote>
                <span className="text-muted-foreground">Converted</span>
                <span className="text-foreground font-semibold tabular-nums">
                  {trialConv.converted} of {trialConv.eligible}
                </span>
              </MetricFootnote>
            ),
        },
        {
          label: "Open tickets",
          value: complaints.open,
          href: complaintHref("/dashboard/tickets", {
            ...complaintFilters,
            statuses: ["open", "in_progress", "waiting_on_customer"],
          }),
          tone: complaints.open > 0 ? "warn" : "default",
          badge: "Open",
          badgeTone: complaints.open > 0 ? "warn" : "neutral",
        },
        {
          label: "Total tickets",
          value: complaints.total,
          hint: "Complaints in this range",
          href: complaintHref("/dashboard/tickets", complaintFilters),
          badge: "In range",
          badgeTone: "neutral",
        },
      ]}
    />
  );
}

async function RevenueChart({ scope }: { scope: AnalyticsScope }) {
  const report = await loadReport(scope);
  return <TrendLineChart data={report.trend} xKey="period" yKey="netSales" format="currency" />;
}

async function CohortChart({ scope }: { scope: AnalyticsScope }) {
  const { slices } = await getRevenueCohortMix(scope);
  const chartRows = slices.filter((s) => s.amount > 0);
  return (
    <div className="space-y-3">
      <DistributionDonutChart
        data={chartRows}
        nameKey="label"
        valueKey="amount"
        colorKey="color"
        format="currency"
        legend={false}
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
            {s.count} {s.count === 1 ? "payment" : "payments"}
          </span>
        </li>
      ))}
    </ul>
  );
}
