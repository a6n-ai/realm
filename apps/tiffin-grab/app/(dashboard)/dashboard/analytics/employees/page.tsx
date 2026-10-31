import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { Suspense } from "react";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { AnalyticsStatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { inquiriesHref } from "@/lib/analytics/drill";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { PartsDonut } from "@/components/analytics/charts";
import { slotTone, type Part } from "@/components/analytics/chart-math";
import { Skeleton } from "@foundry/ui/skeleton";
import { Card, CardContent } from "@foundry/ui/card";
import { Badge } from "@/components/reui/badge";
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
      <Suspense fallback={<StatCardsSkeleton count={4} cols={4} />}>
        <StatsData scope={scope} />
      </Suspense>

      <ChartCard title="Reps ranked by revenue" subtitle="Revenue owned, orders, renewals and activity" info="Revenue is net of tax and refunds for orders each rep owns, by payment date. Orders owned are by order date. Renewal rate is the share of those orders with a later plan by the same customer.">
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <RepCards scope={scope} />
        </Suspense>
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard title="Revenue by rep" subtitle="Net revenue on orders each rep owns" info="Net of tax and refunds, by payment date. Unassigned is revenue on orders with no owner, mostly migrated from the old site.">
          <Suspense fallback={<ChartSkeleton />}>
            <RevenueChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Workload mix" subtitle="Order actions logged by each rep" info="Rows in the order activity log by who logged them, on orders in range.">
          <Suspense fallback={<ChartSkeleton />}>
            <WorkloadDonut scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard title="Leads worked per rep" subtitle="Inquiries each rep touched">
          <Suspense fallback={<ChartSkeleton />}>
            <LeadsChart scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Tickets resolved per rep" subtitle="Resolved or closed tickets" info="In this range, by resolved date.">
          <Suspense fallback={<ChartSkeleton />}>
            <TicketsChart scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <ChartCard title="Per-rep breakdown" subtitle="Everything each rep owned and worked" info="Leads by inquiry date, tickets by resolved date, orders by order date, revenue by payment date. Open a count to see those inquiries or tickets.">
        <Suspense fallback={<TableRowsSkeleton />}>
          <RollupTable scope={scope} />
        </Suspense>
      </ChartCard>
    </div>
  );
}

const usd = (v: number) => v.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

async function StatsData({ scope }: { scope: AnalyticsScope }) {
  const { rows, unassignedRevenue } = await getEmployeeRollup(scope);
  const worked = rows.reduce((s, r) => s + r.leadsWorked, 0);
  const converted = rows.reduce((s, r) => s + r.leadsConverted, 0);
  const resolved = rows.reduce((s, r) => s + r.ticketsResolved, 0);
  const hours = rows.reduce((s, r) => s + (r.avgResolutionHours ?? 0) * r.ticketsResolved, 0);
  return (
    <AnalyticsStatCards
      items={[
        { label: "Active reps", value: rows.length, hint: "Reps with any orders, leads, tickets or actions in range", badge: "Reps", badgeTone: "neutral" },
        {
          label: "Revenue owned",
          value: usd(rows.reduce((s, r) => s + r.revenueOwned, 0)),
          hint: `${usd(unassignedRevenue)} unassigned · net, ${DATE_BASIS_LABEL.money}`,
          badge: "Revenue",
          badgeTone: "ok",
        },
        {
          label: "Lead conversion",
          value: worked > 0 ? `${Math.round((converted / worked) * 1000) / 10}%` : "—",
          hint: `${converted} converted of ${worked} worked · ${DATE_BASIS_LABEL.leads}`,
          href: inquiriesHref(scope),
          badge: "Leads",
          badgeTone: "brand",
        },
        {
          label: "Avg resolution",
          value: resolved > 0 ? `${Math.round((hours / resolved) * 10) / 10}h` : "—",
          hint: `${resolved} tickets resolved or closed in range`,
          href: "/dashboard/tickets?status=resolved,closed",
          badge: "Tickets",
          badgeTone: "neutral",
        },
      ]}
    />
  );
}

async function RepCards({ scope }: { scope: AnalyticsScope }) {
  const { rows } = await getEmployeeRollup(scope);
  if (rows.length === 0) return <p className="text-muted-foreground py-8 text-center text-sm">No rep activity in this range.</p>;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {rows.slice(0, 12).map((r, i) => (
        <Card key={r.userId} className="h-full">
          <CardContent className="flex flex-col items-start gap-2">
            <Badge variant="secondary">#{i + 1}</Badge>
            <span className="w-full truncate text-sm font-medium">{r.name}</span>
            <span className="text-3xl font-semibold tabular-nums">{usd(r.revenueOwned)}</span>
            <dl className="text-muted-foreground grid w-full grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
              <dt>Orders owned</dt><dd className="text-foreground tabular-nums">{r.ordersOwned}</dd>
              <dt>Renewal rate</dt><dd className="text-foreground tabular-nums">{r.renewalRatePct != null ? `${r.renewalRatePct}%` : "—"}</dd>
              <dt>Leads worked / converted</dt><dd className="text-foreground tabular-nums">{r.leadsWorked} / {r.leadsConverted}</dd>
              <dt>Tickets resolved</dt><dd className="text-foreground tabular-nums">{r.ticketsResolved}{r.avgResolutionHours != null ? ` (${r.avgResolutionHours}h)` : ""}</dd>
              <dt>Actions logged</dt><dd className="text-foreground tabular-nums">{r.actions}</dd>
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// A rep keeps one colour in every donut on the page: their rank by revenue owned (the rollup's order).
const repTone = (rows: { userId: string }[], r: { userId: string }) => slotTone(r.userId, rows.map((x) => x.userId));

async function RevenueChart({ scope }: { scope: AnalyticsScope }) {
  const { rows, unassignedRevenue } = await getEmployeeRollup(scope);
  const parts: Part[] = [
    ...rows.filter((r) => r.revenueOwned > 0).map((r) => ({ label: r.name, value: r.revenueOwned, tone: repTone(rows, r) })),
    ...(unassignedRevenue > 0 ? [{ label: "Unassigned", value: unassignedRevenue, tone: "muted" as const }] : []),
  ];
  return <PartsDonut format="currency" caption="Revenue" max={5} emptyLabel="No revenue in this range." parts={parts} />;
}

async function WorkloadDonut({ scope }: { scope: AnalyticsScope }) {
  const { rows } = await getEmployeeRollup(scope);
  const parts = rows.filter((r) => r.actions > 0).map((r) => ({ label: r.name, value: r.actions, tone: repTone(rows, r) }));
  return <PartsDonut caption="Actions" max={5} emptyLabel="No order actions in this range." parts={parts} />;
}

async function LeadsChart({ scope }: { scope: AnalyticsScope }) {
  const { rows } = await getEmployeeRollup(scope);
  const parts = rows.map((r) => ({ label: r.name, value: r.leadsWorked, tone: repTone(rows, r) }));
  return <PartsDonut caption="Leads" max={5} emptyLabel="No leads worked in this range." parts={parts} />;
}

async function TicketsChart({ scope }: { scope: AnalyticsScope }) {
  const { rows } = await getEmployeeRollup(scope);
  const parts = rows.map((r) => ({ label: r.name, value: r.ticketsResolved, tone: repTone(rows, r) }));
  return <PartsDonut caption="Tickets" max={5} emptyLabel="No tickets resolved in this range." parts={parts} />;
}

async function RollupTable({ scope }: { scope: AnalyticsScope }) {
  const { rows } = await getEmployeeRollup(scope);
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
