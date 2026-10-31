import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { Suspense } from "react";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { StatCards, StatCardsSkeleton,  } from "@/components/dashboard/stat-cards";
import { inquiriesHref } from "@/lib/analytics/drill";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { BreakdownBarChart } from "@/components/analytics/charts";
import { Skeleton } from "@foundry/ui/skeleton";
import { getEmployeeRollup } from "@/lib/services/analytics/employees.service";
import { EmployeeRollupTable } from "./rollup-table";
import { DATE_BASIS_LABEL, type AnalyticsScope } from "@/lib/services/analytics/metrics/scope";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function EmployeesAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const resolved = await scopeOrAlert("/dashboard/analytics/employees", await searchParams);
  if (!resolved.scope) return resolved.alert;
  const { scope } = resolved;
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsIntro
        description="What each rep worked, converted, and closed."
        action={
          <Suspense fallback={<Skeleton className="h-6 w-28 rounded-full" />}>
            <AnalyticsLiveStamp />
          </Suspense>
        }
      />
      <Suspense fallback={<StatCardsSkeleton count={3} cols={3} />}>
        <StatsData scope={scope} />
      </Suspense>

      <ChartCard title="Leads worked per rep" subtitle="Inquiries each rep touched in this range.">
        <Suspense fallback={<ChartSkeleton />}>
          <LeadsChart scope={scope} />
        </Suspense>
      </ChartCard>

      <ChartCard title="Per-rep breakdown" subtitle="Leads by inquiry date, tickets by resolved date. Open a count to see those inquiries or tickets.">
        <Suspense fallback={<TableRowsSkeleton />}>
          <RollupTable scope={scope} />
        </Suspense>
      </ChartCard>
    </div>
  );
}

async function StatsData({ scope }: { scope: AnalyticsScope }) {
  const rows = await getEmployeeRollup(scope);
  const activeReps = rows.length;
  const totalLeadsWorked = rows.reduce((s, r) => s + r.leadsWorked, 0);
  const totalTicketsResolved = rows.reduce((s, r) => s + r.ticketsResolved, 0);
  return (
    <StatCards
      cols={3}
      items={[
        { label: "Active reps", value: activeReps, badge: "Reps", badgeTone: "neutral" },
        {
          label: "Total leads worked",
          value: totalLeadsWorked,
          hint: DATE_BASIS_LABEL.leads,
          href: inquiriesHref(scope),
          badge: "Leads",
          badgeTone: "brand",
        },
        {
          label: "Total tickets resolved",
          value: totalTicketsResolved,
          hint: "Resolved or closed in range, by resolved date. The link opens all resolved and closed tickets, not limited to this range.",
          href: "/dashboard/tickets?status=resolved,closed",
          badge: "Resolved",
          badgeTone: "ok",
        },
      ]}
    />
  );
}

async function LeadsChart({ scope }: { scope: AnalyticsScope }) {
  const rows = await getEmployeeRollup(scope);
  const data = rows.map((r) => ({ name: r.name, n: r.leadsWorked }));
  return <BreakdownBarChart data={data} xKey="name" yKey="n" />;
}

async function RollupTable({ scope }: { scope: AnalyticsScope }) {
  const rows = await getEmployeeRollup(scope);
  return <EmployeeRollupTable rows={rows} scope={scope} />;
}

function TableRowsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}
