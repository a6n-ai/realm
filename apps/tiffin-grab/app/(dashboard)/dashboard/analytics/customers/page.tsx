import { Skeleton } from "@foundry/ui/skeleton";
import { Suspense } from "react";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { StatCards, StatCardsSkeleton,  } from "@/components/dashboard/stat-cards";
import { BreakdownBarChart, TrendLineChart } from "@/components/analytics/charts";
import { getSession } from "@/lib/auth/session";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { ordersDrillHref } from "@/lib/services/analytics/metrics/orders";
import { DATE_BASIS_LABEL, type AnalyticsScope } from "@/lib/services/analytics/metrics/scope";
import {
  getCustomerStats,
  getSignupTrend,
  getSubscriptionMix,
  getTopCities,
} from "@/lib/services/analytics/customers.service";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function CustomersAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const resolved = await scopeOrAlert("/dashboard/analytics/customers", await searchParams);
  if (!resolved.scope) return resolved.alert;
  const { scope } = resolved;
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsIntro
        description="Who is subscribed, who is paused, and where new accounts are coming from."
        action={
          <Suspense fallback={<Skeleton className="h-6 w-28 rounded-full" />}>
            <AnalyticsLiveStamp />
          </Suspense>
        }
      />
      <Suspense fallback={<StatCardsSkeleton count={4} cols={4} />}>
        <StatsData scope={scope} />
      </Suspense>

      <ChartCard title="Signups over time" subtitle="New customer accounts created in this range, by local day. With a franchise or filter selected, only accounts with an order in scope are counted.">
        <Suspense fallback={<ChartSkeleton />}>
          <SignupChart scope={scope} />
        </Suspense>
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Subscription status mix" subtitle={`Orders ${DATE_BASIS_LABEL.orders}. Open a status to see those orders.`}>
          <Suspense fallback={<ChartSkeleton />}>
            <MixChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Top cities" subtitle={`Customers grouped by city · ${DATE_BASIS_LABEL.orders}`}>
          <Suspense fallback={<ChartSkeleton />}>
            <CitiesChart scope={scope} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function StatsData({ scope }: { scope: AnalyticsScope }) {
  const [s, visible] = await Promise.all([getCustomerStats(scope), resolveSessionVisibleOrgIds(await getSession())]);
  return (
    <StatCards
      cols={4}
      items={[
        {
          label: "Customers",
          value: s.customers,
          hint: `With an order · ${DATE_BASIS_LABEL.orders}`,
          badge: "Accounts",
          badgeTone: "neutral",
        },
        {
          label: "Active customers",
          value: s.activeCustomers,
          hint: `Active plan created or running in range · ${DATE_BASIS_LABEL.orders}`,
          badge: "Active",
          badgeTone: "ok",
        },
        {
          label: "Paused customers",
          value: s.pausedToday,
          hint: "Active plan with a paused delivery · today",
          tone: s.pausedToday > 0 ? "warn" : undefined,
          badge: "Paused",
          badgeTone: s.pausedToday > 0 ? "warn" : "neutral",
        },
        {
          label: "Cancelled orders",
          value: s.cancelledOrders,
          hint: DATE_BASIS_LABEL.orders,
          href: ordersDrillHref(scope, { status: ["cancelled"] }, visible),
          badge: "Cancelled",
          badgeTone: "neutral",
        },
      ]}
    />
  );
}

async function SignupChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getSignupTrend(scope);
  return <TrendLineChart data={rows} xKey="day" yKey="n" />;
}

async function MixChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getSubscriptionMix(scope);
  return (
    <BreakdownList
      rows={rows.map((r) => ({
        label: r.status,
        n: r.n,
        href: ordersDrillHref(scope, { status: [r.key] }),
      }))}
      emptyLabel="No subscriptions yet."
    />
  );
}

async function CitiesChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getTopCities(8, scope);
  return <BreakdownBarChart data={rows} xKey="city" yKey="n" />;
}
