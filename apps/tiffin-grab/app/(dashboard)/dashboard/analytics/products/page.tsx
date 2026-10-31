import { TotalLine } from "@/components/analytics/total-line";
import { Skeleton } from "@foundry/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { cache, Suspense } from "react";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { ChartCard } from "@/components/analytics/chart-card";
import { AnalyticsStatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { chartColor } from "@/components/analytics/chart-math";
import { RankCards } from "@/components/analytics/rank-cards";
import { HeatmapGrid, PartsDonut, TreemapChart } from "@/components/analytics/charts";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import {
  getAddonSales,
  getPaidByTier,
  getPaidByTierAndDiet,
  getPickers,
  getProductSales,
  getProductStats,
  getSizeSales,
  getTopDishes,
  dietOrder,
  tierOrder,
} from "@/lib/services/analytics/products.service";
import { revenueTotals } from "@/lib/services/analytics/metrics/money";
import { buildSizeTreemap, type SizeMetric } from "@/lib/analytics/size-treemap";
import { DATE_BASIS_LABEL, type AnalyticsScope } from "@/lib/services/analytics/metrics/scope";

// Several cards read the same numbers; React's cache shares one query per request (the scope object is the key).
const productStats = cache(getProductStats);
const sizeSales = cache(getSizeSales);

const METRICS: { value: SizeMetric; label: string }[] = [
  { value: "revenue", label: "Revenue" },
  { value: "tiffins", label: "Tiffins" },
];
const metricFormat = (m: SizeMetric) => (m === "revenue" ? "currency" : "number");

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function ProductsAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const resolved = await scopeOrAlert("/dashboard/analytics/products", await searchParams);
  if (!resolved.scope) return resolved.alert;
  const { scope } = resolved;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <AnalyticsIntro
          description="What sells, in which plan and size, and what customers pick."
          action={
            <Suspense fallback={<Skeleton className="h-6 w-28 rounded-full" />}>
              <AnalyticsLiveStamp />
            </Suspense>
          }
        />
        <Suspense fallback={<Skeleton className="h-5 w-full max-w-xl" />}>
          <ContextLine scope={scope} />
        </Suspense>
      </div>
      <Suspense fallback={<StatCardsSkeleton count={4} cols={4} />}>
        <StatsData scope={scope} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard
          title="Sales by plan and size"
          subtitle="Every meal size by plan" info={`Revenue is net, counted ${DATE_BASIS_LABEL.money}; tiffins are scheduled ${DATE_BASIS_LABEL.deliveries}. Custom sizes share one box per plan.`}
        >
          <Suspense fallback={<ChartSkeleton height={340} />}>
            <SizeTreemap scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Which meal size tier earns the most?" subtitle="Net revenue by size tier" info={`Counted ${DATE_BASIS_LABEL.money}. Budget, medium, and premium; custom sizes are grouped as Custom.`}>
          <Suspense fallback={<ChartSkeleton />}>
            <TierDonut scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard
          title="Which sizes sell in which diet?"
          subtitle="Net revenue by size tier and plan" info={`Counted ${DATE_BASIS_LABEL.money}. Custom sizes are grouped as Custom.`}
        >
          <Suspense fallback={<ChartSkeleton />}>
            <TierByDietChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Veg or non-veg?" subtitle="Net revenue or tiffins delivered" info="Plans compared by net revenue or by tiffins delivered. Custom sizes are included.">
          <Suspense fallback={<ChartSkeleton />}>
            <PlanSplit scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard
          title="Add-ons sold"
          subtitle="Add-on sales, top four and the rest"
          info={`Pre-tax line amount saved on each order, orders ${DATE_BASIS_LABEL.orders}; cancelled orders left out. The list shows quantity sold.`}
        >
          <Suspense fallback={<ChartSkeleton />}>
            <AddonDonut scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard
          title="What sells?"
          subtitle="Meal size and plan length, by orders"
          info={`Orders ${DATE_BASIS_LABEL.orders}, cancelled orders left out. Revenue is net, ${DATE_BASIS_LABEL.money}, for the same size and length, so it can include payments on orders placed outside the range.`}
        >
          <Suspense fallback={<ChartSkeleton height={340} />}>
            <ProductSalesList scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <ChartCard title="Most-picked dishes" subtitle="Share of all dish picks, top 8" info={`On orders ${DATE_BASIS_LABEL.orders}. Dot colour is the dish's plan.`}>
        <Suspense fallback={<ChartSkeleton height={340} />}>
          <TopDishesList scope={scope} />
        </Suspense>
      </ChartCard>
    </div>
  );
}

async function ContextLine({ scope }: { scope: AnalyticsScope }) {
  const [stats, sales] = await Promise.all([productStats(scope), sizeSales(scope)]);
  const tiffins = sales.reduce((s, r) => s + r.tiffins, 0);
  return (
    <p className="text-muted-foreground text-sm">
      {stats.totalSelections.toLocaleString()} dish picks across {tiffins.toLocaleString()} tiffins delivered. Picks show what customers chose, not everything served.
    </p>
  );
}

async function StatsData({ scope }: { scope: AnalyticsScope }) {
  const [sales, totals, pickers] = await Promise.all([sizeSales(scope), revenueTotals(scope), getPickers(scope)]);
  const tiffins = sales.reduce((s, r) => s + r.tiffins, 0);
  const top = sales.filter((r) => !r.custom && r.revenue > 0).sort((a, b) => b.revenue - a.revenue)[0];
  return (
    <AnalyticsStatCards
      items={[
        {
          label: "Tiffins delivered",
          value: tiffins,
          hint: `Scheduled tiffins, ${DATE_BASIS_LABEL.deliveries}`,
          badge: "Units",
          badgeTone: "neutral",
        },
        {
          label: "Net revenue per tiffin",
          value: tiffins === 0 ? "—" : (totals.net / tiffins).toLocaleString("en-CA", { style: "currency", currency: "CAD" }),
          hint: `Net revenue ${DATE_BASIS_LABEL.money} ÷ tiffins ${DATE_BASIS_LABEL.deliveries}`,
          badge: "Average",
          badgeTone: "neutral",
        },
        {
          label: "Top meal size",
          value: top?.size ?? "—",
          hint: `Most net revenue ${DATE_BASIS_LABEL.money}; custom sizes left out`,
          valueSize: "label",
          badge: "Top",
          badgeTone: "ok",
        },
        {
          label: "Customers who picked dishes",
          value: `${pickers.pickers.toLocaleString()} of ${pickers.customers.toLocaleString()}`,
          hint: `Customers with picks on orders ${DATE_BASIS_LABEL.orders} · customers with deliveries ${DATE_BASIS_LABEL.deliveries}`,
          valueSize: "label",
          badge: "Picks",
          badgeTone: "brand",
        },
      ]}
    />
  );
}

/** Same tab toggle as the Revenue page; both metrics render on the server so the toggle needs no fetch. */
function MetricTabs({ render }: { render: (metric: SizeMetric) => React.ReactNode }) {
  return (
    <Tabs defaultValue="revenue" className="gap-4">
      <TabsList>
        {METRICS.map((m) => (
          <TabsTrigger key={m.value} value={m.value}>
            {m.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {METRICS.map((m) => (
        <TabsContent key={m.value} value={m.value}>
          {render(m.value)}
        </TabsContent>
      ))}
    </Tabs>
  );
}

async function SizeTreemap({ scope }: { scope: AnalyticsScope }) {
  const sales = await sizeSales(scope);
  return (
    <MetricTabs
      render={(metric) => <TreemapChart data={buildSizeTreemap(sales, metric, dietOrder)} format={metricFormat(metric)} />}
    />
  );
}

async function PlanSplit({ scope }: { scope: AnalyticsScope }) {
  const sales = await sizeSales(scope);
  return (
    <MetricTabs
      render={(metric) => (
        <PartsDonut
          format={metricFormat(metric)}
          parts={buildSizeTreemap(sales, metric, dietOrder).map((g) => ({ label: g.name, value: g.children.reduce((s, c) => s + c.value, 0) }))}
        />
      )}
    />
  );
}

async function TierDonut({ scope }: { scope: AnalyticsScope }) {
  const rows = await getPaidByTier(scope);
  return <PartsDonut format="currency" parts={rows.map((r) => ({ label: r.tier, value: r.paid }))} />;
}

async function TierByDietChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getPaidByTierAndDiet(scope);
  const diets = [...new Set(rows.map((r) => r.diet))].sort(dietOrder);
  const tiers = [...new Map(rows.map((r) => [r.tierKey, r.tier])).entries()].sort(([a], [b]) => tierOrder(a, b)).map(([, label]) => label);
  return (
    <HeatmapGrid
      rows={tiers}
      columns={diets}
      cells={tiers.map((tier) => diets.map((d) => rows.find((r) => r.tier === tier && r.diet === d)?.paid ?? null))}
      format="currency"
    />
  );
}

async function AddonDonut({ scope }: { scope: AnalyticsScope }) {
  const rows = await getAddonSales(scope);
  return (
    <PartsDonut
      format="currency"
      max={5}
      parts={rows.map((r) => ({ label: r.name, value: r.amount }))}
      listParts={rows.map((r) => ({ label: r.name, value: r.amount, meta: `${r.qty.toLocaleString()} sold` }))}
    />
  );
}

const money = (v: number) => v.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const sum = (rows: { orders: number; revenue: number }[], k: "orders" | "revenue") => Math.round(rows.reduce((t, r) => t + r[k], 0) * 100) / 100;

async function ProductSalesList({ scope }: { scope: AnalyticsScope }) {
  const all = await getProductSales(scope);
  if (all.length === 0) return <p className="text-muted-foreground py-8 text-center text-sm">No orders in this range.</p>;
  return (
    <div className="flex flex-col gap-3">
      <RankCards
        items={all.slice(0, 8).map((r, i) => ({
          rank: i + 1,
          title: `${r.size} · ${r.weeks} ${r.weeks === 1 ? "week" : "weeks"}`,
          value: plural(r.orders, "order", "orders"),
          meta: [`${money(r.revenue)} net revenue`],
        }))}
      />
      {all.length > 8 ? <p className="text-muted-foreground text-xs">Other · {all.length - 8} more products</p> : null}
      <TotalLine label="Total" value={`${plural(sum(all, "orders"), "order", "orders")} · ${money(sum(all, "revenue"))}`} />
    </div>
  );
}

async function TopDishesList({ scope }: { scope: AnalyticsScope }) {
  const rows = await getTopDishes(500, scope);
  if (rows.length === 0) return <p className="text-muted-foreground py-8 text-center text-sm">No dish picks in this range.</p>;
  const total = rows.reduce((s, r) => s + r.n, 0);
  const planNames = [...new Set(rows.map((r) => r.plan))].sort(dietOrder);
  const top = [...rows].sort((a, b) => b.n - a.n).slice(0, 8);
  const rest = rows.length - top.length;
  return (
    <div className="flex flex-col gap-3">
      {planNames.length > 1 ? (
        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {planNames.map((name, i) => (
            <li key={name} className="flex items-center gap-1.5">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: chartColor(i) }} />
              {name}
            </li>
          ))}
        </ul>
      ) : null}
      <RankCards
        items={top.map((r, i) => ({
          rank: i + 1,
          title: r.dish,
          value: plural(r.n, "pick", "picks"),
          meta: [`${total > 0 ? Math.round((r.n / total) * 100) : 0}% of picks${r.category ? ` · ${r.category}` : ""}`],
          dot: chartColor(planNames.indexOf(r.plan)),
        }))}
      />
      {rest > 0 ? <p className="text-muted-foreground text-xs">Other · {rest} more dishes</p> : null}
    </div>
  );
}
