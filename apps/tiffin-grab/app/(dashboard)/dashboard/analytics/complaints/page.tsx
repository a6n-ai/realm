import { Skeleton } from "@foundry/ui/skeleton";
import { Suspense } from "react";
import { AnalyticsLiveStamp } from "@/components/analytics/analytics-live-stamp";
import { AnalyticsIntro } from "@/components/analytics/analytics-intro";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { TrendLineChart } from "@/components/analytics/charts";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { AnalyticsStatCards, StatCardsSkeleton, StatFootnote } from "@/components/dashboard/stat-cards";
import { categoryLabel } from "@/lib/support/ticket-taxonomy";
import { priorityLabel } from "@/lib/support/ticket-priority";
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
  getComplaintKpis,
  getComplaintTrend,
  getNeedsAttention,
  getPriorityMix,
  getRepeatCustomers,
  getStatusMix,
  getTopIssues,
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
  const drill = sp.drill;
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

      <ChartCard title="Complaint trend" subtitle={`Complaints raised per local day · ${DATE_BASIS_LABEL.tickets}`}>
        <Suspense fallback={<ChartSkeleton />}>
          <Trend scope={scope} />
        </Suspense>
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="By category" subtitle="Select a category to see its sub-categories.">
          <Suspense fallback={<ChartSkeleton />}>
            <Categories scope={scope} drill={drill} />
          </Suspense>
        </ChartCard>
        <ChartCard title="By sub-category">
          <Suspense fallback={<ChartSkeleton />}>
            <Subcategories scope={scope} drill={drill} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Status">
          <Suspense fallback={<ChartSkeleton />}>
            <Statuses scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Priority">
          <Suspense fallback={<ChartSkeleton />}>
            <Priorities scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="Top issues" subtitle="Most common reasons, across categories.">
          <Suspense fallback={<ChartSkeleton />}>
            <TopIssuesSection scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Customers with repeat complaints">
          <Suspense fallback={<ChartSkeleton />}>
            <RepeatCustomers scope={scope} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ChartCard title="By plan">
          <Suspense fallback={<ChartSkeleton />}>
            <Plans scope={scope} />
          </Suspense>
        </ChartCard>
        <ChartCard title="By delivery zone">
          <Suspense fallback={<ChartSkeleton />}>
            <Zones scope={scope} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function Kpis({ scope }: { scope: AnalyticsScope }) {
  const filters = scopeToComplaintFilters(scope);
  const k = await getComplaintKpis(scope);
  const basis = DATE_BASIS_LABEL.tickets;
  return (
    <AnalyticsStatCards
      items={[
        {
          label: "Total complaints",
          value: k.total,
          hint: `${k.open} open · raised in range, ${basis}`,
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

  const rows = [
    {
      label: "High & critical, still open",
      n: a.urgent,
      href: ticketsHref(filters, {
        priorities: ["high", "urgent"],
        statuses: ["open", "in_progress", "waiting_on_customer"],
      }),
    },
    {
      label: "Overdue (no reply in 24h)",
      n: a.overdue,
      href: ticketsHref(filters, { statuses: ["open", "in_progress"] }),
    },
    { label: "Never answered", n: a.unanswered, href: ticketsHref(filters, { statuses: ["new"] }) },
    { label: "Customers complaining repeatedly", n: a.repeatCustomers },
  ];

  return (
    <ChartCard title="Needs attention" subtitle="Complaints that should not wait. Open these first.">
      <BreakdownList rows={rows} />
    </ChartCard>
  );
}

async function Trend({ scope }: { scope: AnalyticsScope }) {
  const filters = scopeToComplaintFilters(scope);
  const rows = await getComplaintTrend(scope);
  if (rows.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">No complaints in this range.</p>;
  }
  return <TrendLineChart data={rows} xKey="day" yKey="n" label="Complaints" />;
}

async function Categories({ scope, drill }: { scope: AnalyticsScope; drill?: string }) {
  const rows = await getByCategory(scope);
  return (
    <BreakdownList
      rows={rows.map((r) => ({
        label: r.category,
        n: r.n,
        // Selecting a category drills in place; the link keeps every other filter.
        href: `?${new URLSearchParams([...scopeToSearchParams(scope), ["drill", r.value]])}`,
        active: drill === r.value,
        muted: !r.isComplaint,
        meta: r.isComplaint ? undefined : "Not counted as a complaint",
      }))}
    />
  );
}

async function Subcategories({ scope, drill: category }: { scope: AnalyticsScope; drill?: string }) {
  const filters = scopeToComplaintFilters(scope);
  if (!category) {
    return <p className="text-muted-foreground py-8 text-center text-sm">Pick a category to break it down.</p>;
  }
  const rows = await getBySubcategory(scope, category);
  return (
    <BreakdownList
      emptyLabel={`No ${categoryLabel(category)} complaints in this range.`}
      rows={rows.map((r) => ({
        label: r.label,
        n: r.n,
        href: ticketsHref(filters, { categories: [category], subcategories: r.value ? [r.value] : [] }),
      }))}
    />
  );
}

async function Statuses({ scope }: { scope: AnalyticsScope }) {
  const filters = scopeToComplaintFilters(scope);
  const rows = await getStatusMix(scope);
  return (
    <BreakdownList
      rows={rows.map((r) => ({ label: r.status, n: r.n, href: ticketsHref(filters, { statuses: [r.value] }) }))}
    />
  );
}

async function Priorities({ scope }: { scope: AnalyticsScope }) {
  const filters = scopeToComplaintFilters(scope);
  const rows = await getPriorityMix(scope);
  return (
    <BreakdownList
      rows={rows.map((r) => ({
        label: priorityLabel(r.value),
        n: r.n,
        href: ticketsHref(filters, { priorities: [r.value] }),
      }))}
    />
  );
}

async function TopIssuesSection({ scope }: { scope: AnalyticsScope }) {
  const filters = scopeToComplaintFilters(scope);
  const rows = await getTopIssues(scope);
  return (
    <BreakdownList
      rows={rows.map((r) => ({
        label: r.label,
        meta: r.categoryLabel,
        n: r.n,
        href: ticketsHref(filters, {
          categories: [r.category],
          subcategories: r.subcategory ? [r.subcategory] : [],
        }),
      }))}
    />
  );
}

async function RepeatCustomers({ scope }: { scope: AnalyticsScope }) {
  const filters = scopeToComplaintFilters(scope);
  const rows = await getRepeatCustomers(scope);
  if (rows.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">No repeat complaints in this range.</p>;
  }
  return (
    <BreakdownList
      rows={rows.map((r) => ({
        label: r.name ?? r.email ?? "Customer",
        meta: r.name ? (r.email ?? undefined) : undefined,
        n: r.n,
        href: `/dashboard/customers/${r.publicId}`,
      }))}
    />
  );
}

async function Plans({ scope }: { scope: AnalyticsScope }) {
  const filters = scopeToComplaintFilters(scope);
  const rows = await getByPlan(scope);
  return (
    <BreakdownList
      rows={rows.map((r) => ({
        label: r.label,
        n: r.n,
        muted: r.value === NOT_LINKED,
        href: ticketsHref(filters, { plans: [r.value] }),
      }))}
    />
  );
}

async function Zones({ scope }: { scope: AnalyticsScope }) {
  const filters = scopeToComplaintFilters(scope);
  const rows = await getByZone(scope);
  return (
    <BreakdownList
      rows={rows.map((r) => ({
        label: r.label,
        n: r.n,
        muted: r.value === NOT_LINKED,
        href: ticketsHref(filters, { zones: [r.value] }),
      }))}
    />
  );
}
