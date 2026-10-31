import { Skeleton } from "@foundry/ui/skeleton";
import { Suspense } from "react";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { calendarSkeletonHeight } from "@/lib/analytics/calendar-height";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { rankedHeight } from "@/components/analytics/chart-math";
import Link from "next/link";
import { BreakdownBarChart, CalendarHeatmap, PartsDonut } from "@/components/analytics/charts";
import { Card, CardContent } from "@foundry/ui/card";
import { RankCards } from "@/components/analytics/rank-cards";
import { Badge } from "@/components/reui/badge";
import { formatEpoch } from "@/lib/format/datetime";
import { isoDateInZone } from "@/lib/analytics/profitability";
import type { Tone } from "@/components/analytics/chart-math";
import { AnalyticsStatCards, StatCardsSkeleton, StatFootnote } from "@/components/dashboard/stat-cards";
import {
  NOT_LINKED,
  complaintHref,
  scopeToComplaintFilters,
  type ComplaintFilters,
} from "@/lib/services/analytics/complaint-filters";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { DATE_BASIS_LABEL, scopeToSearchParams, type AnalyticsScope } from "@/lib/services/analytics/metrics/scope";
import {
  getByCategory,
  getByPlan,
  getBySubcategory,
  getByZone,
  getComplaintDaily,
  getComplaintKpis,
  getNeedsAttention,
  getPriorityMix,
  getRepeatCustomers,
  getStatusMix,
} from "@/lib/services/analytics/complaints.service";

const TICKETS = "/dashboard/tickets";

type SearchParams = Promise<Record<string, string | undefined>>;

/** Drill-through link: carries the page's active filters plus the clicked slice. */
function ticketsHref(filters: ComplaintFilters, extra: Partial<ComplaintFilters> = {}) {
  return complaintHref(TICKETS, { ...filters, ...extra });
}

export default async function ComplaintsAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const resolved = await scopeOrAlert("/dashboard/analytics/complaints", sp);
  if (!resolved.scope) return resolved.alert;
  const { scope } = resolved;
  // The Category filter wins over the clicked bar.
  const drill = scopeToComplaintFilters(scope).categories?.[0] ?? sp.drill;
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsIntro
        description="Tickets raised in this range, and which ones still need a reply."
        action={
          <Suspense fallback={<Skeleton className="h-6 w-28 rounded-full" />}>
            <AnalyticsLiveStamp />
          </Suspense>
        }
      />
      <Suspense fallback={<StatCardsSkeleton count={4} cols={4} />}>
        <Kpis scope={scope} />
      </Suspense>

      <Suspense fallback={<ChartSkeleton />}>
        <NeedsAttentionSection scope={scope} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard title="Complaints calendar" subtitle="Complaints raised per day" info={`Counted ${DATE_BASIS_LABEL.tickets}. Darker is more.`}>
          <Suspense fallback={<ChartSkeleton height={calendarSkeletonHeight(scope)} />}>
            <Trend scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="By category" subtitle="Tickets per category" info="Select a bar to see its sub-categories.">
          <Suspense fallback={<ChartSkeleton height={rankedHeight(9)} />}>
            <Categories scope={scope} drill={drill} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard title="By sub-category" subtitle="Top 8 in the selected category">
          <Suspense fallback={<ChartSkeleton height={rankedHeight(9)} />}>
            <Subcategories scope={scope} drill={drill} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Status">
          <Suspense fallback={<ChartSkeleton />}>
            <Statuses scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard title="By plan">
          <Suspense fallback={<ChartSkeleton />}>
            <Plans scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="By delivery zone">
          <Suspense fallback={<ChartSkeleton height={rankedHeight(9)} />}>
            <Zones scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <div id="repeat-customers" className="scroll-mt-20">
        <ChartCard title="Customers with repeat complaints" subtitle="Top 10 in this range">
          <Suspense fallback={<ChartSkeleton />}>
            <RepeatCustomers scope={scope} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function Kpis({ scope }: { scope: AnalyticsScope }) {
  const filters = scopeToComplaintFilters(scope);
  const [k, priorities] = await Promise.all([getComplaintKpis(scope), getPriorityMix(scope)]);
  const urgent = priorities.find((p) => p.value === "urgent")?.n ?? 0;
  const basis = DATE_BASIS_LABEL.tickets;
  return (
    <AnalyticsStatCards
      items={[
        {
          label: "Total complaints",
          value: k.total,
          hint: `${k.open} open · raised in range, ${basis}${urgent > 0 ? ` · ${urgent} urgent` : ""}`,
          href: ticketsHref(filters),
          badge: "In range",
          badgeTone: "neutral",
          tone: k.open > 0 ? "warn" : undefined,
        },
        {
          label: "Resolution rate",
          value: k.resolutionRatePct != null ? `${k.resolutionRatePct}%` : "—",
          hint:
            k.resolutionRatePct == null
              ? `No complaints in range · ${basis}`
              : `${k.resolved} resolved or closed, of all complaints · ${basis}`,
          href: ticketsHref(filters, { statuses: ["resolved", "closed"] }),
          badge: "Rate",
          badgeTone: "brand",
        },
        {
          label: "Avg. resolution time",
          value: k.avgResolutionHours != null ? `${k.avgResolutionHours}h` : "—",
          hint: k.avgResolutionHours == null ? "Nothing resolved yet" : `From open to resolved · ${basis}`,
          badge: "Time",
          badgeTone: "neutral",
        },
        {
          label: "Per 100 tiffins",
          value: k.perHundredTiffins != null ? k.perHundredTiffins : "—",
          hint:
            k.perHundredTiffins == null
              ? "No tiffins delivered in range"
              : "Complaints against delivered tiffins · by ticket date",
          badge: "Rate",
          badgeTone: "brand",
          footer:
            k.perHundredTiffins == null ? undefined : (
              <StatFootnote>
                <span className="text-muted-foreground">Tiffins delivered</span>
                <span className="text-foreground font-semibold tabular-nums">{k.deliveredTiffins.toLocaleString()}</span>
              </StatFootnote>
            ),
        },
      ]}
    />
  );
}

async function NeedsAttentionSection({ scope }: { scope: AnalyticsScope }) {
  const filters = scopeToComplaintFilters(scope);
  const a = await getNeedsAttention(scope);
  if (a.urgent + a.overdue + a.unanswered + a.repeatCustomers === 0) return null;

  const cards = [
    {
      label: "High & critical, still open",
      hint: "Priority high or urgent, not yet resolved",
      n: a.urgent,
      tone: "destructive-light" as const,
      href: ticketsHref(filters, {
        priorities: ["high", "urgent"],
        statuses: ["open", "in_progress", "waiting_on_customer"],
      }),
    },
    {
      label: "Overdue",
      hint: "No reply in 24 hours",
      n: a.overdue,
      tone: "warning-light" as const,
      href: ticketsHref(filters, { statuses: ["open", "in_progress"] }),
    },
    {
      label: "Never answered",
      hint: "No staff reply yet",
      n: a.unanswered,
      tone: "warning-light" as const,
      href: ticketsHref(filters, { statuses: ["new"] }),
    },
    {
      label: "Repeat complainers",
      hint: "Customers complaining more than once",
      n: a.repeatCustomers,
      tone: "warning-light" as const,
      href: "#repeat-customers",
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold">Needs attention</h2>
        <p className="text-muted-foreground text-xs">Complaints that should not wait. Open these first.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-2"
          >
            <Card className="hover:bg-muted/50 h-full transition-colors">
              <CardContent className="flex flex-col gap-2">
                <span className="text-sm font-medium">{c.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-semibold tabular-nums">{c.n}</span>
                  {c.n > 0 ? <Badge variant={c.tone}>Act now</Badge> : null}
                </div>
                <span className="text-muted-foreground text-xs">{c.hint}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

async function Trend({ scope }: { scope: AnalyticsScope }) {
  const rows = await getComplaintDaily(scope);
  return (
    <CalendarHeatmap
      from={isoDateInZone(scope.fromMs, scope.tz)}
      to={isoDateInZone(scope.toMs, scope.tz)}
      today={isoDateInZone(Date.now(), scope.tz)}
      label="Complaints"
      days={rows.map((r) => ({ date: r.iso, value: r.n }))}
    />
  );
}

async function Categories({ scope, drill }: { scope: AnalyticsScope; drill?: string }) {
  const rows = await getByCategory(scope);
  return (
    <BreakdownBarChart
      data={rows.map((r) => ({
        category: r.category,
        n: r.n,
        // Selecting a category drills in place; the link keeps every other filter.
        href: `?${new URLSearchParams([...scopeToSearchParams(scope), ["drill", r.value]])}`,
        active: drill === r.value ? 1 : 0,
        // Feedback and suggestions are shown but not counted as complaints.
        muted: r.isComplaint ? 0 : 1,
      }))}
      xKey="category"
      yKey="n"
      label="Complaints"
      hrefKey="href"
      activeKey="active"
      mutedKey="muted"
    />
  );
}

async function Subcategories({ scope, drill: category }: { scope: AnalyticsScope; drill?: string }) {
  if (!category) {
    return <p className="text-muted-foreground py-8 text-center text-sm">Pick a category to break it down.</p>;
  }
  const filters = scopeToComplaintFilters(scope);
  const rows = await getBySubcategory(scope, category);
  return (
    <BreakdownBarChart
      data={rows.map((r) => ({
        label: r.label,
        n: r.n,
        href: ticketsHref(filters, { categories: [category], subcategories: r.value ? [r.value] : [] }),
      }))}
      xKey="label"
      yKey="n"
      label="Complaints"
      hrefKey="href"
    />
  );
}

const TICKET_TONE: Record<string, Tone> = { open: "warning", in_progress: "c2", waiting_on_customer: "c3", resolved: "success", closed: "muted" };

async function Statuses({ scope }: { scope: AnalyticsScope }) {
  const filters = scopeToComplaintFilters(scope);
  const rows = await getStatusMix(scope);
  return (
    <PartsDonut
      caption="Complaints"
      max={6}
      emptyLabel="No complaints in this range."
      parts={rows.map((r) => ({ label: r.status, value: r.n, tone: TICKET_TONE[r.value] ?? "chart", href: ticketsHref(filters, { statuses: [r.value] }) }))}
    />
  );
}

async function RepeatCustomers({ scope }: { scope: AnalyticsScope }) {
  const filters = scopeToComplaintFilters(scope);
  const rows = await getRepeatCustomers(scope, 10);
  const base = ticketsHref(filters);
  if (rows.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">No repeat complaints in this range.</p>;
  }
  return (
    <RankCards
      cols={5}
      items={rows.map((r, i) => ({
        rank: i + 1,
        title: r.name ?? r.email ?? "Customer",
        value: String(r.n),
        href: `${base}${base.includes("?") ? "&" : "?"}q=${encodeURIComponent(r.email ?? r.name ?? "")}`,
        meta: [
          ...(r.topCategoryLabel ? [`Mostly ${r.topCategoryLabel}`] : []),
          `Last ${formatEpoch(Number(r.lastAt), { mode: "date", timeZone: scope.tz })}`,
          ...(r.name && r.email ? [r.email] : []),
        ],
      }))}
    />
  );
}

async function Plans({ scope }: { scope: AnalyticsScope }) {
  const filters = scopeToComplaintFilters(scope);
  const rows = await getByPlan(scope);
  return (
    <PartsDonut
      caption="Complaints"
      max={5}
      emptyLabel="No complaints in this range."
      parts={rows.map((r) => ({ label: r.label, value: r.n, tone: r.value === NOT_LINKED ? "muted" : "chart", href: ticketsHref(filters, { plans: [r.value] }) }))}
    />
  );
}

async function Zones({ scope }: { scope: AnalyticsScope }) {
  const filters = scopeToComplaintFilters(scope);
  const rows = await getByZone(scope);
  return (
    <BreakdownBarChart
      data={rows.map((r) => ({ label: r.label, n: r.n, href: ticketsHref(filters, { zones: [r.value] }), muted: r.value === NOT_LINKED ? 1 : 0 }))}
      xKey="label"
      yKey="n"
      label="Complaints"
      hrefKey="href"
      mutedKey="muted"
    />
  );
}
