import { Skeleton } from "@foundry/ui/skeleton";
import { cache, Suspense } from "react";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartBoundary } from "@/components/analytics/chart-boundary";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { grainUnitForRange } from "@/lib/analytics/revenue";
import { AnalyticsStatCards, StatCardsSkeleton, StatFootnote } from "@/components/dashboard/stat-cards";
import { PartsDonut, SegmentedBar, TrendLineChart } from "@/components/analytics/charts";
import { DailyScorecard } from "@/components/analytics/daily-scorecard";
import { ORDER_TONE } from "@/components/analytics/status-tones";
import { complaintHref, scopeToComplaintFilters } from "@/lib/services/analytics/complaint-filters";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { paymentsHref } from "@/lib/analytics/drill";
import { countCustomers, countOrders, ordersDrillHref } from "@/lib/services/analytics/metrics/orders";
import { SETTLED_STATUSES } from "@/lib/analytics/revenue";
import { currentMonth } from "@/lib/analytics/profitability";
import { getRevenueReport, getRevenueCohortMix } from "@/lib/services/analytics/revenue.service";
import { getComplaintKpis } from "@/lib/services/analytics/complaints.service";
import { getProfitabilityReport } from "@/lib/services/analytics/profitability.service";
import { getDailyScorecard, getTrialToPlanConversion } from "@/lib/services/analytics/overview.service";
import { getSubscriptionMix } from "@/lib/services/analytics/customers.service";
import { DATE_BASIS_LABEL, type AnalyticsScope } from "@/lib/services/analytics/metrics/scope";
import type { AnalyticsSearchParams } from "@/lib/services/analytics/shared-filters";
import { analyticsHref } from "@/lib/services/analytics/shared-filter-params";

function money(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}


type SearchParams = Promise<AnalyticsSearchParams>;

const loadReport = cache((scope: AnalyticsScope) => getRevenueReport(scope));
// One profitability report per request for the profit card and the scorecard.
const loadProfit = cache((scope: AnalyticsScope) => getProfitabilityReport({ month: currentMonth(scope.tz), grain: "daily", scope }));
const loadTrial = cache((scope: AnalyticsScope) => getTrialToPlanConversion(scope));

export default async function OverviewAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const resolved = await scopeOrAlert("/dashboard/analytics/overview", sp);
  if (!resolved.scope) return resolved.alert;
  const { scope } = resolved;
  const unit = grainUnitForRange(scope.fromMs, scope.toMs, scope.tz);
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

      <Suspense fallback={<StatCardsSkeleton count={8} cols={4} />}>
        <StatsData sp={sp} scope={scope} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard
          title={`Net revenue by ${unit}`}
          subtitle="Ex tax and surcharge, after refunds" info={`Counted ${DATE_BASIS_LABEL.money}.${unit === "day" ? " Line is the 7-day average." : ""}`}
        >
          <Suspense fallback={<ChartSkeleton />}>
            <RevenueChart scope={scope} daily={unit === "day"} />
          </Suspense>
        </ChartCard>
        <ChartCard
          title="Revenue mix"
          subtitle="Renewals, new plans and trials" info={`Net revenue, counted ${DATE_BASIS_LABEL.money}.`}
        >
          <Suspense fallback={<ChartSkeleton />}>
            <CohortChart scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartBoundary>
          <Suspense fallback={<ChartSkeleton height={300} />}>
            <TrialRate scope={scope} />
          </Suspense>
        </ChartBoundary>
        <ChartCard title="Customer status" subtitle="Orders by status" info={`Counted ${DATE_BASIS_LABEL.orders}. Open a status to see those orders.`}>
          <Suspense fallback={<ChartSkeleton />}>
            <StatusSplit scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <ChartCard
        title="Day by day"
        subtitle="Each day: revenue, costs and profit" info="Each column is shaded on its own scale. Weekends and days without deliveries are muted. Open a day to see its orders. Monthly costs are company-wide."
      >
        <Suspense fallback={<ChartSkeleton height={320} />}>
          <Scorecard scope={scope} />
        </Suspense>
      </ChartCard>
    </div>
  );
}

// Always rendered (empty state when no trial has ended) so the row never appears or vanishes after load.
async function TrialRate({ scope }: { scope: AnalyticsScope }) {
  const t = await loadTrial(scope);
  const has = t.eligible > 0 && t.conversionRatePct != null;
  return (
    <ChartCard
      title="What share of trials became a plan?"
      subtitle={
        has
          ? "Ended trials that went on to a later plan"
          : t.open > 0
            ? `${t.open} still open`
            : "No trials ended in range"
      }
      info={has ? `Trials that ended ${t.windowDays}+ days ago and went on to a later plan.` : undefined}
    >
      <PartsDonut
        caption="converted"
        label={has ? `${t.conversionRatePct}%` : undefined}
        footnote={has ? `${t.converted} of ${t.eligible} trials converted` : undefined}
        parts={has ? [{ label: "Converted", value: t.converted, tone: "chart" }, { label: "Not converted", value: t.eligible - t.converted, tone: "muted" }] : []}
      />
    </ChartCard>
  );
}

async function StatsData({ sp, scope }: { sp: AnalyticsSearchParams; scope: AnalyticsScope }) {
  const [revenue, activePlans, customers, complaints, profit, trialConv] = await Promise.all([
    loadReport(scope),
    countOrders(scope, { status: ["active"] }),
    countCustomers(scope),
    getComplaintKpis(scope),
    loadProfit(scope),
    loadTrial(scope),
  ]);
  const paid = paymentsHref(scope, { statuses: SETTLED_STATUSES, methods: scope.extra.method, basis: "money" });
  const complaintFilters = scopeToComplaintFilters(scope);

  return (
    <AnalyticsStatCards
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
          label: "Customers",
          value: customers,
          hint: `Distinct people with an order · ${DATE_BASIS_LABEL.orders}`,
          href: analyticsHref("/dashboard/analytics/customers", sp),
          badge: "People",
          badgeTone: "neutral",
        },
        {
          label: "Open tickets",
          value: complaints.open,
          href: complaintHref("/dashboard/tickets", {
            ...complaintFilters,
            statuses: ["open", "in_progress", "waiting_on_customer"],
          }),
          hint: `Not yet resolved · ${DATE_BASIS_LABEL.tickets}`,
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

async function RevenueChart({ scope, daily }: { scope: AnalyticsScope; daily: boolean }) {
  const report = await loadReport(scope);
  return <TrendLineChart data={report.trend} xKey="period" tipKey="tip" yKey="netSales" label="Net revenue" format="currency" average={daily} />;
}

async function StatusSplit({ scope }: { scope: AnalyticsScope }) {
  const rows = await getSubscriptionMix(scope);
  return <PartsDonut caption="Orders" max={6} parts={rows.map((r) => ({ label: r.status, value: r.n, tone: ORDER_TONE[r.key] ?? "chart", href: ordersDrillHref(scope, { status: [r.key] }) }))} />;
}

async function Scorecard({ scope }: { scope: AnalyticsScope }) {
  const rows = await getDailyScorecard(scope, { profit: await loadProfit(scope) });
  if (!rows) return <p className="text-muted-foreground py-8 text-center text-sm">Pick a range up to 3 months to see day by day.</p>;
  return <DailyScorecard rows={rows} />;
}

async function CohortChart({ scope }: { scope: AnalyticsScope }) {
  const { slices } = await getRevenueCohortMix(scope);
  return <SegmentedBar parts={slices.map((s) => ({ label: s.label, value: s.amount }))} format="currency" withList />;
}
