/* eslint-disable react-hooks/purity */
import { Skeleton } from "@foundry/ui/skeleton";
import { cache, Suspense } from "react";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { calendarSkeletonHeight } from "@/components/analytics/calendar-height";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { CalendarHeatmap, PartsDonut, RadialRateChart, TrendLineChart } from "@/components/analytics/charts";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { AnalyticsStatCards, StatCardsSkeleton, type AnalyticsStatCardItem } from "@/components/dashboard/stat-cards";
import { LiveRefresh } from "@/components/analytics/live-refresh";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { paymentsHref } from "@/lib/analytics/drill";
import { getRevenueReport } from "@/lib/services/analytics/revenue.service";
import { DATE_BASIS_LABEL, type AnalyticsScope } from "@/lib/services/analytics/metrics/scope";
import { clockInZone, isoDateInZone } from "@/lib/analytics/profitability";
import { topWithOther, type Tone } from "@/components/analytics/chart-math";
import { ChartBoundary } from "@/components/analytics/chart-boundary";
import { grainUnitForRange, SETTLED_STATUSES, type DiscountLine, type DiscountSource } from "@/lib/analytics/revenue";
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
  const unit = grainUnitForRange(scope.fromMs, scope.toMs, scope.tz);
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsIntro
        description="Money kept after refunds, excluding tax and card surcharge, by payment date."
        action={
          <Suspense fallback={<Skeleton className="h-8 w-64" />}>
            <RangeAndLive scope={scope} />
          </Suspense>
        }
      />

      <Suspense fallback={<StatCardsSkeleton count={8} cols={4} />}>
        <Kpis scope={scope} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard
          title={`Net revenue by ${unit}`}
          subtitle={`Ex tax and surcharge, after refunds, ${DATE_BASIS_LABEL.money}.${unit === "day" ? " Line is the 7-day average." : ""}`}
        >
          <Suspense fallback={<ChartSkeleton />}>
            <NetByDay scope={scope} daily={unit === "day"} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Revenue calendar" subtitle={`Net revenue per day, ${DATE_BASIS_LABEL.money}. Darker is more.`}>
          <Suspense fallback={<ChartSkeleton height={calendarSkeletonHeight(scope)} />}>
            <RevenueCalendar scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <ChartBoundary>
        <Suspense fallback={<ChartSkeleton height={160} />}>
          <NeedsReview scope={scope} />
        </Suspense>
      </ChartBoundary>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard
          title="How much is still owed?"
          subtitle="Collected out of collected plus awaiting payment and needs review."
        >
          <Suspense fallback={<ChartSkeleton />}>
            <Owed scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Payments by status" subtitle={`Every payment ${DATE_BASIS_LABEL.money}, by amount.`}>
          <Suspense fallback={<ChartSkeleton />}>
            <Statuses scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard title="By payment method" subtitle={`Net revenue, ex tax & surcharge, ${DATE_BASIS_LABEL.money}.`}>
          <Suspense fallback={<ChartSkeleton />}>
            <MethodChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Discounts given" subtitle="Across settled orders in this range.">
          <Suspense fallback={<ChartSkeleton />}>
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
    paymentsHref(scope, { statuses, methods: only, basis: "money" });
}

async function Kpis({ scope }: { scope: AnalyticsScope }) {
  const k = (await loadReport(scope)).kpis;
  const href = links(scope);
  const paid = href();
  const basis = DATE_BASIS_LABEL.money;
  const items: AnalyticsStatCardItem[] = [
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
      hint: k.discountRatePct == null ? "No sales in range" : `${k.discountRatePct}% of list price · ${basis}`,
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
      tone: k.refunds > 0 ? "warn" : undefined,
      hint: "By refund date",
      footer:
        k.unlinkedRefunds > 0 ? (
          <p className="text-muted-foreground text-xs">
            {k.unlinkedRefunds} {k.unlinkedRefunds === 1 ? "refund" : "refunds"} not linked to a payment{" "}
            {k.unlinkedRefunds === 1 ? "is" : "are"} not deducted
          </p>
        ) : undefined,
      badge: "Refunds",
      badgeTone: k.refunds > 0 ? "warn" : "neutral",
    },
    {
      label: "Net collected",
      value: money(k.netCollected),
      hint: k.refunds > 0 ? `${money(k.gross)} received − ${money(k.refundsExSurcharge)} refunded` : `Payments incl. tax, ${basis}`,
      href: paid,
      badge: "Cash",
      badgeTone: "ok",
    },
    {
      label: "Awaiting payment",
      value: money(k.pendingAmount),
      tone: k.pendingCount > 0 ? "warn" : undefined,
      hint: `${k.pendingCount} ${k.pendingCount === 1 ? "payment" : "payments"} not yet verified · ${basis}`,
      href: href(["awaiting_payment", "pending_verification"]),
      badge: "Pending",
      badgeTone: k.pendingCount > 0 ? "warn" : "neutral",
    },
    {
      label: "Avg order value",
      value: k.avgOrderValue == null ? "—" : money(k.avgOrderValue),
      hint: `${k.orders} settled ${k.orders === 1 ? "order" : "orders"}, ex tax & surcharge, after refunds · ${basis}`,
      href: paid,
      badge: "Average",
      badgeTone: "brand",
    },
    {
      label: "Card surcharge",
      value: money(k.surcharge),
      hint: `Charged on top of card payments, not revenue · ${basis}`,
      href: paid,
      badge: "Surcharge",
      badgeTone: "neutral",
    },
  ];
  return <AnalyticsStatCards items={items} />;
}

const STATUS_TONE: Record<string, Tone> = {
  paid: "success",
  simulated_paid: "muted",
  awaiting_payment: "warning",
  pending_verification: "chart",
  pending: "muted",
  rejected: "destructive",
  refunded: "muted",
};

async function Statuses({ scope }: { scope: AnalyticsScope }) {
  const report = await loadReport(scope);
  const href = links(scope);
  return (
    <PartsDonut
      format="currency"
      caption="Payments"
      max={7}
      parts={report.byStatus.map((s) => ({ label: s.label, value: s.amount, tone: STATUS_TONE[s.status] ?? "muted", href: href([s.status]) }))}
    />
  );
}

async function Owed({ scope }: { scope: AnalyticsScope }) {
  const { kpis: k } = await loadReport(scope);
  const total = k.netCollected + k.pendingAmount;
  const rate = total > 0 ? (k.netCollected / total) * 100 : 0;
  return (
    <div className="flex flex-col gap-3">
      <RadialRateChart
        data={total > 0 ? [{ label: "Collected", rate: Number(rate.toFixed(rate < 10 ? 1 : 0)) }] : []}
        nameKey="label"
        valueKey="rate"
        caption="collected"
      />
      <dl className="flex flex-col gap-1.5 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Collected</dt>
          <dd className="font-semibold tabular-nums">{money(k.netCollected)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Awaiting or needs review</dt>
          <dd className="font-semibold tabular-nums">{money(k.pendingAmount)}</dd>
        </div>
      </dl>
    </div>
  );
}

async function NetByDay({ scope, daily }: { scope: AnalyticsScope; daily: boolean }) {
  const report = await loadReport(scope);
  return <TrendLineChart data={report.trend} xKey="period" tipKey="tip" yKey="netSales" label="Net revenue" format="currency" average={daily} />;
}

async function RevenueCalendar({ scope }: { scope: AnalyticsScope }) {
  const report = await loadReport(scope);
  return (
    <CalendarHeatmap
      from={report.from}
      to={report.to}
      today={isoDateInZone(Date.now(), scope.tz)}
      label="Net revenue"
      format="currency"
      days={report.daily.map((d) => ({ date: d.iso, value: d.net }))}
    />
  );
}

async function MethodChart({ scope }: { scope: AnalyticsScope }) {
  const report = await loadReport(scope);
  const href = links(scope);
  return <PartsDonut format="currency" caption="Net revenue" parts={report.byMethod.map((m) => ({ label: m.method, value: m.amount, href: href(SETTLED_STATUSES, [m.key]) }))} />;
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
      rows={topWithOther(
        discounts.map((d: DiscountLine) => ({
          label: d.label,
          amount: d.amount,
          meta: `${SOURCE_LABEL[d.source]} · ${d.orders} ${d.orders === 1 ? "order" : "orders"}`,
        })),
        "label",
        "amount",
      ).map((d) => ({ label: String(d.label), n: Number(d.amount), aside: money(Number(d.amount)), meta: d.meta == null ? undefined : String(d.meta) }))}
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
