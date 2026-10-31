import { Suspense } from "react";
import { SkeletonStatCards } from "@/components/ds";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsPageHeader } from "@/components/analytics/analytics-page-header";
import { ChartCard } from "@/components/analytics/chart-card";
import { MetricTiles } from "@/components/analytics/metric-tiles";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { BreakdownBarChart } from "@/components/analytics/charts";
import { getSession } from "@/lib/auth/session";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { ordersDrillHref } from "@/lib/analytics/drill";
import {
  getProductStats,
  getTopDishes,
  getPaidByPlan,
  getPaidByTier,
  getPaidByMealType,
} from "@/lib/services/analytics/products.service";
import { DATE_BASIS_LABEL, type AnalyticsScope } from "@/lib/services/analytics/metrics/scope";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function ProductsAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const resolved = await scopeOrAlert("/dashboard/analytics/products", await searchParams);
  if (!resolved.scope) return resolved.alert;
  const { scope } = resolved;
  return (
    <div className="flex flex-col gap-5">
      <AnalyticsPageHeader
        section="Products & Menu"
        title="Products & Menu"
        description="What people pick, and how paid orders split across plans, sizes, and meal types."
        action={
          <Suspense fallback={<div className="bg-muted/40 h-7 w-28 animate-pulse rounded-full" />}>
            <AnalyticsLiveStamp />
          </Suspense>
        }
      />
      <Suspense fallback={<SkeletonStatCards count={3} />}>
        <StatsData scope={scope} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Most-picked dishes" subtitle={`Meal selections on orders ${DATE_BASIS_LABEL.orders}; cancelled unpaid orders left out.`}>
          <Suspense fallback={<ChartSkeleton />}>
            <TopDishesChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Paid by meal size" subtitle={`Net revenue ${DATE_BASIS_LABEL.money}. Budget, medium, and premium; custom sizes are not included. May differ from the total by rounding.`}>
          <Suspense fallback={<ChartSkeleton />}>
            <TierBarChart scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Paid by plan" subtitle={`Net revenue ${DATE_BASIS_LABEL.money}, ex tax and surcharge, after refunds. Open a plan to see orders created in this range (bars are payments by payment date). May differ from the total by rounding.`}>
          <Suspense fallback={<ChartSkeleton />}>
            <PlanChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard
          title="Paid by meal type"
          subtitle={`Net revenue ${DATE_BASIS_LABEL.money}. Maharaja Thali, 4 Item Thali, and other catalog sizes; custom sizes are not included. May differ from the total by rounding.`}
        >
          <Suspense fallback={<ChartSkeleton />}>
            <MealTypeList scope={scope} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData({ scope }: { scope: AnalyticsScope }) {
  const s = await getProductStats(scope);
  return (
    <MetricTiles
      cols={3}
      items={[
        { label: "Meal selections", value: s.totalSelections, badge: "Picks", badgeTone: "neutral" },
        { label: "Distinct dishes ordered", value: s.distinctDishes, badge: "Dishes", badgeTone: "brand" },
        {
          label: "Most popular dish",
          value: s.topDish ?? "—",
          valueSize: "label",
          badge: "Top",
          badgeTone: "ok",
        },
      ]}
    />
  );
}

async function TopDishesChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getTopDishes(8, scope);
  return <BreakdownBarChart data={rows} xKey="dish" yKey="n" height={280} />;
}

async function TierBarChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getPaidByTier(scope);
  return (
    <BreakdownBarChart
      data={rows.map((r) => ({ tier: r.tier, paid: r.paid }))}
      xKey="tier"
      yKey="paid"
      format="currency"
      height={280}
    />
  );
}

function money(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

async function PlanChart({ scope }: { scope: AnalyticsScope }) {
  const [rows, visible] = await Promise.all([getPaidByPlan(scope), resolveSessionVisibleOrgIds(await getSession())]);
  return (
    <BreakdownList
      rows={rows.map((r) => ({
        label: r.plan,
        n: r.paid,
        aside: money(r.paid),
        meta: `${r.payments} ${r.payments === 1 ? "payment" : "payments"}`,
        href: ordersDrillHref({ ...scope, plans: [r.key] }, {}, visible),
      }))}
      emptyLabel="No payments in this range."
    />
  );
}

async function MealTypeList({ scope }: { scope: AnalyticsScope }) {
  const rows = await getPaidByMealType(scope);
  return (
    <BreakdownList
      rows={rows.map((r) => ({
        label: r.mealType,
        n: r.paid,
        aside: money(r.paid),
        meta: `${r.plan} · ${r.payments} ${r.payments === 1 ? "payment" : "payments"}`,
      }))}
      emptyLabel="No payments in this range."
    />
  );
}

