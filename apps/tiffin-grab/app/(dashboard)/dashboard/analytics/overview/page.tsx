import { Skeleton } from "@foundry/ui/skeleton";
import { cache, Suspense } from "react";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { StatCards, StatCardsSkeleton, StatFootnote } from "@/components/dashboard/stat-cards";
import { DistributionDonutChart, RadialRateChart, TrendLineChart } from "@/components/analytics/charts";
import { complaintHref, scopeToComplaintFilters } from "@/lib/services/analytics/complaint-filters";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { paymentsHref } from "@/lib/analytics/drill";
import { countOrders, ordersDrillHref } from "@/lib/services/analytics/metrics/orders";
import { SETTLED_STATUSES } from "@/lib/analytics/revenue";
import type { RevenueCohortSlice } from "@/lib/analytics/revenue-cohorts";
import { currentMonth } from "@/lib/analytics/profitability";
import { getRevenueReport, getRevenueCohortMix } from "@/lib/services/analytics/revenue.service";
import { getComplaintKpis } from "@/lib/services/analytics/complaints.service";
import { getProfitabilityReport } from "@/lib/services/analytics/profitability.service";
import { getTrialToPlanConversion } from "@/lib/services/analytics/overview.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { DATE_BASIS_LABEL, type AnalyticsScope } from "@/lib/services/analytics/metrics/scope";
import type { AnalyticsSearchParams } from "@/lib/services/analytics/shared-filters";
import { analyticsHref } from "@/lib/services/analytics/shared-filter-params";

function money(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

// Matches the donut card (240px donut + three legend rows) so the paired cards share one row height.
const TREND_HEIGHT = 340;

type SearchParams = Promise<AnalyticsSearchParams>;

const loadReport = cache((scope: AnalyticsScope) => getRevenueReport(scope));
const loadTrial = cache((scope: AnalyticsScope) => getTrialToPlanConversion(scope));

export default async function OverviewAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const resolved = await scopeOrAlert("/dashboard/analytics/overview", sp);
  if (!resolved.scope) return resolved.alert;
  const { scope } = resolved;
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsIntro
        description="Sales, profit, customers, and tickets for the selected range."
        action={
          <Suspense fallback={<Skeleton className="h-6 w-28 rounded-full" />}>
            <AnalyticsLiveStamp />
          </Suspense>
        }
      />

      <Suspense fallback={<StatCardsSkeleton count={7} cols={4} />}>
        <StatsData sp={sp} scope={scope} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Net revenue" subtitle={`Ex tax & surcharge, after refunds, by day · ${DATE_BASIS_LABEL.money}`}>
          <Suspense fallback={<ChartSkeleton height={TREND_HEIGHT} />}>
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

      <Suspense fallback={<ChartSkeleton />}>
        <TrialRate scope={scope} />
      </Suspense>
    </div>
  );
}

async function TrialRate({ scope }: { scope: AnalyticsScope }) {
  const t = await loadTrial(scope);
  if (t.eligible === 0 || t.conversionRatePct == null) return null;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
      <ChartCard
        title="What share of trials became a plan?"
        subtitle={`${t.converted} of ${t.eligible} trials that ended ${t.windowDays}+ days ago went on to a later plan.`}
      >
        <RadialRateChart data={[{ label: "Trial → Plan", rate: t.conversionRatePct }]} nameKey="label" valueKey="rate" />
      </ChartCard>
    </div>
  );
}

async function StatsData({ sp, scope }: { sp: AnalyticsSearchParams; scope: AnalyticsScope }) {
  const { timezone } = await getAppSettings();
  const [revenue, activePlans, complaints, profit, trialConv] = await Promise.all([
    loadReport(scope),
    countOrders(scope, { status: ["active"] }),
    getComplaintKpis(scope),
    getProfitabilityReport({
      month: currentMonth(timezone),
      grain: "daily",
      scope,
    }),
    loadTrial(scope),
  ]);
  const paid = paymentsHref(scope, { statuses: SETTLED_STATUSES, methods: scope.extra.method, basis: "money" });
  const complaintFilters = scopeToComplaintFilters(scope);

  return (
    <StatCards
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
              <StatFootnote>
                <span className="text-muted-foreground">Share of list price</span>
                <span className="text-foreground font-semibold tabular-nums">{revenue.kpis.discountRatePct}%</span>
              </StatFootnote>
            ),
        },
        {
          label: "Net profit",
          value: money(profit.kpis.profit),
          hint: `Under current cost assumptions · ${DATE_BASIS_LABEL.deliveries}`,
          href: analyticsHref("/dashboard/analytics/profitability", sp),
          tone: profit.kpis.profit < 0 ? "bad" : "ok",
          badge: profit.kpis.profit < 0 ? "Below target" : "Net",
          badgeTone: profit.kpis.profit < 0 ? "warn" : "ok",
        },
        {
          label: "Active subscriptions",
          value: activePlans,
          hint: `Active orders · ${DATE_BASIS_LABEL.orders}`,
          href: ordersDrillHref(scope, { status: ["active"] }),
          badge: "Active",
          badgeTone: "ok",
        },
        {
          label: "Trial → Plan",
          value: trialConv.conversionRatePct == null ? "—" : `${trialConv.conversionRatePct}%`,
          hint:
            trialConv.eligible === 0
              ? trialConv.open > 0
                ? `${trialConv.open} still open`
                : "No trials ended in range"
              : `Trials that ended ${trialConv.windowDays}+ days ago; converted = any later plan (same rule as Renewals)${trialConv.open > 0 ? ` · ${trialConv.open} still open` : ""}`,
          href: analyticsHref("/dashboard/analytics/customers", sp),
          badge: "Conversion",
          badgeTone: "brand",
          footer:
            trialConv.eligible === 0 ? undefined : (
              <StatFootnote>
                <span className="text-muted-foreground">Converted</span>
                <span className="text-foreground font-semibold tabular-nums">
                  {trialConv.converted} of {trialConv.eligible}
                </span>
              </StatFootnote>
            ),
        },
        {
          label: "Open tickets",
          value: complaints.open,
          href: complaintHref("/dashboard/tickets", {
            ...complaintFilters,
            statuses: ["open", "in_progress", "waiting_on_customer"],
          }),
          tone: complaints.open > 0 ? "warn" : undefined,
          badge: "Open",
          badgeTone: complaints.open > 0 ? "warn" : "neutral",
        },
        {
          label: "Total tickets",
          value: complaints.total,
          hint: `Complaints · ${DATE_BASIS_LABEL.tickets}`,
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
  return <TrendLineChart data={report.trend} xKey="period" yKey="netSales" format="currency" height={TREND_HEIGHT} />;
}

async function CohortChart({ scope }: { scope: AnalyticsScope }) {
  const { slices } = await getRevenueCohortMix(scope);
  const chartRows = slices.filter((s) => s.amount > 0);
  return (
    <div className="flex flex-col gap-3">
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
    <ul className="flex flex-col gap-1.5 text-sm">
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
