import { Skeleton } from "@foundry/ui/skeleton";
import { Suspense } from "react";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { ChartCard } from "@/components/analytics/chart-card";
import { StatCards, StatCardsSkeleton,  } from "@/components/dashboard/stat-cards";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { ActiveSegmentDonutChart, BreakdownBarChart, GroupedBarChart } from "@/components/analytics/charts";
import { getSession } from "@/lib/auth/session";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { ordersDrillHref } from "@/lib/analytics/drill";
import {
  getProductStats,
  getTopDishes,
  getPaidByPlan,
  getPaidByTier,
  getPaidByTierAndDiet,
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
    <div className="flex flex-col gap-6">
      <AnalyticsIntro
        description="What people pick, and how paid orders split across plans, sizes, and meal types."
        action={
          <Suspense fallback={<Skeleton className="h-6 w-28 rounded-full" />}>
            <AnalyticsLiveStamp />
          </Suspense>
        }
      />
      <Suspense fallback={<StatCardsSkeleton count={3} cols={3} />}>
        <StatsData scope={scope} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Most-picked dishes" subtitle={`Meal selections on orders ${DATE_BASIS_LABEL.orders}; cancelled unpaid orders left out.`}>
          <Suspense fallback={<ChartSkeleton />}>
            <TopDishesChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Which meal size tier earns the most?" subtitle={`Net revenue ${DATE_BASIS_LABEL.money}. Hover a slice to grow it. Budget, medium, and premium; custom sizes are not included. May differ from the total by rounding.`}>
          <Suspense fallback={<ChartSkeleton />}>
            <TierBarChart scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <ChartCard
        title="Which sizes sell in which diet?"
        subtitle={`Net revenue ${DATE_BASIS_LABEL.money} by meal size tier, split by plan (veg, non-veg, healthy). Custom sizes are not included.`}
      >
        <Suspense fallback={<ChartSkeleton />}>
          <TierByDietChart scope={scope} />
        </Suspense>
      </ChartCard>

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
    <StatCards
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
    <ActiveSegmentDonutChart
      data={rows.map((r) => ({ tier: r.tier, paid: r.paid }))}
      nameKey="tier"
      valueKey="paid"
      format="currency"
      height={280}
    />
  );
}

async function TierByDietChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getPaidByTierAndDiet(scope);
  const diets = [...new Set(rows.map((r) => r.diet))];
  const tiers = [...new Map(rows.map((r) => [r.tierKey, r.tier])).values()];
  const data = tiers.map((tier) => ({
    tier,
    ...Object.fromEntries(diets.map((d) => [d, rows.find((r) => r.tier === tier && r.diet === d)?.paid ?? 0])),
  }));
  return (
    <GroupedBarChart
      data={rows.length === 0 ? [] : data}
      xKey="tier"
      series={diets.map((d) => ({ key: d, label: d }))}
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

