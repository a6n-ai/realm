import { Suspense } from "react";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { calendarSkeletonHeight } from "@/lib/analytics/calendar-height";
import { calendarDays } from "@/lib/analytics/calendar-days";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { rankedHeight } from "@/components/analytics/chart-math";
import Link from "next/link";
import { BreakdownBarChart, CalendarHeatmap, PartsDonut } from "@/components/analytics/charts";
import { Card, CardContent } from "@foundry/ui/card";
import { RankCards } from "@/components/analytics/rank-cards";
import { Badge } from "@/components/reui/badge";
import { formatEpoch } from "@/lib/format/datetime";
import type { Tone } from "@/components/analytics/chart-math";
import { AnalyticsStatCards, AnalyticsStatCardsSkeleton, StatFootnote } from "@/components/dashboard/stat-cards";
import {
  NOT_LINKED,
  complaintHref,
  scopeToComplaintFilters,
  type ComplaintFilters,
} from "@/lib/analytics/complaint-filters";
import { scopeOrAlert } from "@/components/analytics/franchise-unavailable";
import { DATE_BASIS_LABEL } from "@/lib/analytics/metrics/scope";
import { type AnalyticsScope } from "@/lib/analytics/scope-types";
import {
  getByCategory,
  getByPlan,
  getTopIssues,
  getByZone,
  getComplaintDaily,
  getComplaintKpis,
  getNeedsAttention,
  getPriorityMix,
  getRepeatCustomers,
  getStatusMix,
} from "@/lib/analytics/complaints.service";
import { OPEN_STATUSES } from "@/lib/support/ticket-status";

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
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsIntro description="Tickets raised in this range, and which ones still need a reply." />
      <Suspense fallback={<AnalyticsStatCardsSkeleton rows={1} />}>
        <Kpis scope={scope} />
      </Suspense>

      <Suspense fallback={<ChartSkeleton />}>
        <NeedsAttentionSection scope={scope} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard title="Complaints calendar" subtitle="Complaints per day" info="The day is the last activity time on the ticket, in Toronto time — the same clock as the tickets list. Darker is more.">
          <Suspense fallback={<ChartSkeleton height={calendarSkeletonHeight(scope)} />}>
            <Trend scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="By delivery zone" subtitle="Tickets per zone of the linked order">
          <Suspense fallback={<ChartSkeleton height={rankedHeight(9)} />}>
            <Zones scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard title="By category" subtitle="Tickets per category" info="Feedback is shown greyed out; it is not counted as a complaint. Select a bar to open those tickets.">
          <Suspense fallback={<ChartSkeleton height={rankedHeight(9)} />}>
            <Categories scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="By sub-category" subtitle="Top issues across every category" info="Each bar is a sub-category with its category after the dot. Feedback is left out. Select a bar to open those tickets.">
          <Suspense fallback={<ChartSkeleton height={rankedHeight(11)} />}>
            <Subcategories scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <ChartCard title="Status">
          <Suspense fallback={<ChartSkeleton />}>
            <Statuses scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="By plan">
          <Suspense fallback={<ChartSkeleton />}>
            <Plans scope={scope} />
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
        statuses: [...OPEN_STATUSES],
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
      {...calendarDays(scope)}
      label="Complaints"
      days={rows.map((r) => ({ date: r.iso, value: r.n }))}
    />
  );
}

async function Categories({ scope }: { scope: AnalyticsScope }) {
  const filters = scopeToComplaintFilters(scope);
  const rows = await getByCategory(scope);
  return (
    <BreakdownBarChart
      data={rows.map((r) => ({
        category: r.category,
        n: r.n,
        href: ticketsHref(filters, { categories: [r.value] }),
        // Feedback and suggestions are shown but not counted as complaints.
        muted: r.isComplaint ? 0 : 1,
      }))}
      xKey="category"
      yKey="n"
      label="Complaints"
      hrefKey="href"
      mutedKey="muted"
      limit={9}
    />
  );
}

/** Every sub-category ranked together, so no category has to be picked first. */
async function Subcategories({ scope }: { scope: AnalyticsScope }) {
  const filters = scopeToComplaintFilters(scope);
  const rows = await getTopIssues(scope, 100);
  return (
    <BreakdownBarChart
      data={rows.map((r) => ({
        label: r.subcategory ? `${r.label} · ${r.categoryLabel}` : `${r.categoryLabel} · no sub-category`,
        n: r.n,
        href: ticketsHref(filters, { categories: [r.category], subcategories: r.subcategory ? [r.subcategory] : [] }),
      }))}
      xKey="label"
      yKey="n"
      label="Complaints"
      hrefKey="href"
      limit={10}
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
