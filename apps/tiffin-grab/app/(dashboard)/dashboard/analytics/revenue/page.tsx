/* eslint-disable react-hooks/purity */
import { cache, Suspense } from "react";
import { SkeletonStatCards } from "@/components/ds";
import { AnalyticsPageHeader } from "@/components/analytics/analytics-page-header";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton, ListSkeleton } from "@/components/analytics/skeletons";
import { TrendLineChart } from "@/components/analytics/charts";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { MetricTiles, type MetricTile } from "@/components/analytics/metric-tiles";
import { LiveRefresh } from "@/components/analytics/live-refresh";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { paymentsHref } from "@/lib/analytics/drill";
import { getRevenueReport } from "@/lib/services/analytics/revenue.service";
import { DATE_BASIS_LABEL, type AnalyticsScope } from "@/lib/services/analytics/metrics/scope";
import { clockInZone } from "@/lib/analytics/profitability";
import { SETTLED_STATUSES, type DiscountLine, type DiscountSource } from "@/lib/analytics/revenue";
import { NeedsReview } from "./needs-review";

function money(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

const RANGE_LABEL = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function rangeLabel(from: string, to: string) {
  const a = RANGE_LABEL.format(new Date(`${from}T00:00:00Z`));
  const b = RANGE_LABEL.format(new Date(`${to}T00:00:00Z`));
  return a === b ? a : `${a} – ${b}`;
}

type SearchParams = Promise<Record<string, string | undefined>>;

const loadReport = cache((scope: AnalyticsScope) => getRevenueReport(scope));

export default async function RevenueAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const resolved = await scopeOrAlert("/dashboard/analytics/revenue", await searchParams);
  if (!resolved.scope) return resolved.alert;
  const { scope } = resolved;
  return (
    <div className="flex flex-col gap-5">
      <AnalyticsPageHeader
        section="Revenue"
        description="Money kept after refunds, excluding tax and card surcharge, by payment date."
        action={
          <Suspense fallback={<div className="bg-muted/40 h-8 w-full max-w-xl animate-pulse rounded-lg" />}>
            <RangeAndLive scope={scope} />
          </Suspense>
        }
      />

      <Suspense fallback={<SkeletonStatCards count={8} />}>
        <Kpis scope={scope} />
      </Suspense>

      <ChartCard
        title="Revenue over time"
        subtitle={`Net revenue excludes tax and surcharge, ${DATE_BASIS_LABEL.money}. Collected is payments received, including tax.`}
      >
        <Suspense fallback={<ChartSkeleton />}>
          <Trend scope={scope} />
        </Suspense>
      </ChartCard>

      <Suspense fallback={<ListSkeleton />}>
        <NeedsReview scope={scope} />
      </Suspense>

      <ChartCard
        title="Payments by status"
        subtitle={`Every payment ${DATE_BASIS_LABEL.money}. Open a row to see those payments.`}
      >
        <Suspense fallback={<ListSkeleton />}>
          <Statuses scope={scope} />
        </Suspense>
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="By payment method" subtitle={`Net revenue, ex tax & surcharge, ${DATE_BASIS_LABEL.money}.`}>
          <Suspense fallback={<ListSkeleton />}>
            <MethodChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Discounts given" subtitle="Across settled orders in this range.">
          <Suspense fallback={<ListSkeleton />}>
            <Discounts scope={scope} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function RangeAndLive({ scope }: { scope: AnalyticsScope }) {
  const report = await loadReport(scope);
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <span className="text-muted-foreground text-xs">{rangeLabel(report.from, report.to)}</span>
      <LiveRefresh updatedLabel={clockInZone(Date.now(), scope.tz)} />
    </div>
  );
}

function links(scope: AnalyticsScope) {
  const methods = scope.extra.method ?? [];
  return (statuses: readonly string[] = SETTLED_STATUSES, only: readonly string[] = methods) =>
    paymentsHref({ statuses, methods: only, fromMs: scope.fromMs, toMs: scope.toMs });
}

async function Kpis({ scope }: { scope: AnalyticsScope }) {
  const k = (await loadReport(scope)).kpis;
  const href = links(scope);
  const paid = href();
  const basis = DATE_BASIS_LABEL.money;
  const second: MetricTile[] = [
    {
      label: "Net collected",
      value: money(k.netCollected),
      hint: k.refunds > 0 ? `${money(k.gross)} received − ${money(k.refunds)} refunded` : `Payments incl. tax, ${basis}`,
      href: paid,
      badge: "Cash",
      badgeTone: "ok",
    },
    {
      label: "Awaiting payment",
      value: money(k.pendingAmount),
      tone: k.pendingCount > 0 ? "warn" : "default",
      hint: `${k.pendingCount} ${k.pendingCount === 1 ? "payment" : "payments"} not yet verified`,
      href: href(["awaiting_payment", "pending_verification"]),
      badge: "Pending",
      badgeTone: k.pendingCount > 0 ? "warn" : "neutral",
    },
    {
      label: "Avg order value",
      value: k.avgOrderValue == null ? "—" : money(k.avgOrderValue),
      hint: `${k.orders} settled ${k.orders === 1 ? "order" : "orders"}, ex tax & surcharge`,
      href: paid,
      badge: "Average",
      badgeTone: "brand",
    },
  ];
  if (k.surcharge > 0) {
    second.push({
      label: "Card surcharge",
      value: money(k.surcharge),
      hint: `Charged on top of the price, not revenue · ${basis}`,
      href: paid,
      badge: "Surcharge",
      badgeTone: "neutral",
    });
  }
  return (
    <div className="space-y-3">
      <MetricTiles
        cols={4}
        items={[
          {
            label: "Net revenue",
            value: money(k.netRevenue),
            hint: `${basis} · ex tax & surcharge`,
            href: paid,
            badge: "Settled",
            badgeTone: "ok",
          },
          {
            label: "Discounts",
            value: money(k.discounts),
            hint: k.discountRatePct == null ? "No sales in range" : `${k.discountRatePct}% of list price`,
            href: paid,
            badge: "Given",
            badgeTone: "brand",
          },
          {
            label: "Tax held",
            value: money(k.tax),
            hint: `Owed to the government, not revenue · ${basis}`,
            href: paid,
            badge: "Tax",
            badgeTone: "neutral",
          },
          {
            label: "Refunded",
            value: money(k.refunds),
            tone: k.refunds > 0 ? "warn" : "default",
            hint: "By refund date",
            href: href(["refunded"]),
            badge: "Refunds",
            badgeTone: k.refunds > 0 ? "warn" : "neutral",
          },
        ]}
      />
      <MetricTiles cols={4} items={second} />
    </div>
  );
}

async function Statuses({ scope }: { scope: AnalyticsScope }) {
  const report = await loadReport(scope);
  const href = links(scope);
  return (
    <BreakdownList
      rows={report.byStatus.map((s) => ({
        label: s.label,
        n: s.count,
        aside: money(s.amount),
        meta: `${s.count} ${s.count === 1 ? "payment" : "payments"}`,
        href: href([s.status]),
      }))}
      emptyLabel="No payments in this range."
    />
  );
}

async function Trend({ scope }: { scope: AnalyticsScope }) {
  const report = await loadReport(scope);
  return (
    <TrendLineChart
      data={report.trend}
      xKey="period"
      format="currency"
      series={[
        { key: "netSales", label: "Net revenue" },
        { key: "collected", label: "Collected" },
      ]}
    />
  );
}

async function MethodChart({ scope }: { scope: AnalyticsScope }) {
  const report = await loadReport(scope);
  const href = links(scope);
  return (
    <BreakdownList
      rows={report.byMethod.map((m) => ({
        label: m.method,
        n: m.amount,
        aside: money(m.amount),
        href: href(SETTLED_STATUSES, [m.key]),
      }))}
      emptyLabel="No settled payments in this range."
    />
  );
}

const SOURCE_LABEL: Record<DiscountSource, string> = {
  catalog: "Plan discount",
  coupon: "Coupon",
  coins: "Wallet",
  other: "Discount",
};

async function Discounts({ scope }: { scope: AnalyticsScope }) {
  const { discounts, kpis } = await loadReport(scope);
  return (
    <BreakdownList
      emptyLabel="No discounts in this range."
      rows={discounts.map((d: DiscountLine) => ({
        label: d.label,
        n: d.amount,
        aside: money(d.amount),
        meta: `${SOURCE_LABEL[d.source]} · ${d.orders} ${d.orders === 1 ? "order" : "orders"}`,
      }))}
      footer={
        discounts.length > 0 ? (
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold tabular-nums">{money(kpis.discounts)}</span>
          </div>
        ) : null
      }
    />
  );
}
