import { Skeleton } from "@foundry/ui/skeleton";
import { Suspense } from "react";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { ChartCard } from "@/components/analytics/chart-card";
import { AnalyticsStatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { rankedHeight } from "@/components/analytics/chart-math";
import { BreakdownBarChart, HeatmapGrid, SegmentedBar } from "@/components/analytics/charts";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import {
  getProductStats,
  getTopDishes,
  getPaidByTier,
  getPaidByTierAndDiet,
  dietOrder,
  tierOrder,
  getPaidByMealType,
} from "@/lib/services/analytics/products.service";
import { DATE_BASIS_LABEL, type AnalyticsScope } from "@/lib/services/analytics/metrics/scope";

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
      <Suspense fallback={<StatCardsSkeleton count={4} cols={4} />}>
        <StatsData scope={scope} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Most-picked dishes" subtitle={`Meal selections on orders ${DATE_BASIS_LABEL.orders}; cancelled unpaid orders left out.`}>
          <Suspense fallback={<ChartSkeleton height={rankedHeight(9)} />}>
            <TopDishesChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Which meal size tier earns the most?" subtitle={`Net revenue ${DATE_BASIS_LABEL.money}. Budget, medium, and premium; custom sizes are not included. May differ from the total by rounding.`}>
          <Suspense fallback={<ChartSkeleton />}>
            <TierBarChart scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard
          title="Which sizes sell in which diet?"
          subtitle={`Net revenue ${DATE_BASIS_LABEL.money} by meal size tier and plan. Custom sizes are not included.`}
        >
          <Suspense fallback={<ChartSkeleton />}>
            <TierByDietChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard
          title="Paid by meal type"
          subtitle={`Net revenue ${DATE_BASIS_LABEL.money}, top 8 and the rest. Custom sizes are not included. May differ from the total by rounding.`}
        >
          <Suspense fallback={<ChartSkeleton height={rankedHeight(9)} />}>
            <MealTypeList scope={scope} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData({ scope }: { scope: AnalyticsScope }) {
  const s = await getProductStats(scope);
  const basis = DATE_BASIS_LABEL.orders;
  return (
    <AnalyticsStatCards
      items={[
        {
          label: "Meal selections",
          value: s.totalSelections,
          hint: `Dishes picked on orders · ${basis}`,
          badge: "Picks",
          badgeTone: "neutral",
        },
        {
          label: "Distinct dishes ordered",
          value: s.distinctDishes,
          hint: `Different dishes picked at least once · ${basis}`,
          badge: "Dishes",
          badgeTone: "brand",
        },
        {
          label: "Avg picks per order",
          value: s.ordersWithPicks === 0 ? "—" : (s.totalSelections / s.ordersWithPicks).toFixed(1),
          hint: `Meal selections per order that has picks · ${basis}`,
          badge: "Average",
          badgeTone: "neutral",
        },
        {
          label: "Most popular dish",
          value: s.topDish ?? "—",
          hint: `Picked most often · ${basis}`,
          valueSize: "label",
          badge: "Top",
          badgeTone: "ok",
        },
      ]}
    />
  );
}

async function TopDishesChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getTopDishes(500, scope);
  return <BreakdownBarChart data={rows} xKey="dish" yKey="n" label="Picks" />;
}

async function TierBarChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getPaidByTier(scope);
  return <SegmentedBar format="currency" withList parts={rows.map((r) => ({ label: r.tier, value: r.paid }))} />;
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

async function MealTypeList({ scope }: { scope: AnalyticsScope }) {
  const rows = await getPaidByMealType(scope);
  return <BreakdownBarChart data={rows.filter((r) => r.paid > 0)} xKey="mealType" yKey="paid" label="Net revenue" format="currency" />;
}
