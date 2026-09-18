import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangleIcon, ClockIcon, InboxIcon, RepeatIcon } from "lucide-react";
import { SectionCard, type FacetDef } from "@/components/ds";
import { ChartCard } from "@/components/analytics/chart-card";
import { ChartSkeleton } from "@/components/analytics/skeletons";
import { TrendLineChart } from "@/components/analytics/charts";
import { BreakdownList } from "@/components/analytics/breakdown-list";
import { MetricTiles } from "@/components/analytics/metric-tiles";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import { categoryLabel, SUBCATEGORIES, TICKET_CATEGORIES } from "@/lib/support/ticket-taxonomy";
import { PRIORITY_OPTIONS, priorityLabel } from "@/lib/support/ticket-priority";
import {
  NOT_LINKED,
  STATUS_OPTIONS,
  complaintHref,
  parseComplaintFilters,
  type ComplaintFilters,
  type ComplaintSearchParams,
} from "@/lib/services/analytics/complaint-filters";
import {
  getByCategory,
  getByPlan,
  getBySubcategory,
  getByZone,
  getComplaintKpis,
  getComplaintTrend,
  getFilterOptions,
  getNeedsAttention,
  getPriorityMix,
  getRepeatCustomers,
  getStatusMix,
  getTopIssues,
} from "@/lib/services/analytics/complaints.service";

const TICKETS = "/dashboard/tickets";

type SearchParams = Promise<ComplaintSearchParams & { drill?: string }>;

/** Drill-through link: carries the page's active filters plus the clicked slice. */
function ticketsHref(filters: ComplaintFilters, extra: Partial<ComplaintFilters> = {}) {
  return complaintHref(TICKETS, { ...filters, ...extra });
}

export default function ComplaintsAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<div className="bg-muted/40 h-10 animate-pulse rounded-lg" />}>
        <Filters />
      </Suspense>

      <Suspense fallback={<ChartSkeleton />}>
        <Kpis searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<ChartSkeleton />}>
        <NeedsAttentionSection searchParams={searchParams} />
      </Suspense>

      <ChartCard title="Complaint trend" subtitle="Complaints raised per day in the selected range.">
        <Suspense fallback={<ChartSkeleton />}>
          <Trend searchParams={searchParams} />
        </Suspense>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="By category" subtitle="Select a category to see its sub-categories.">
          <Suspense fallback={<ChartSkeleton />}>
            <Categories searchParams={searchParams} />
          </Suspense>
        </ChartCard>
        <ChartCard title="By sub-category">
          <Suspense fallback={<ChartSkeleton />}>
            <Subcategories searchParams={searchParams} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Status">
          <Suspense fallback={<ChartSkeleton />}>
            <Statuses searchParams={searchParams} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Priority">
          <Suspense fallback={<ChartSkeleton />}>
            <Priorities searchParams={searchParams} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Top issues" subtitle="Most common reasons, across categories.">
          <Suspense fallback={<ChartSkeleton />}>
            <TopIssuesSection searchParams={searchParams} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Customers with repeat complaints">
          <Suspense fallback={<ChartSkeleton />}>
            <RepeatCustomers searchParams={searchParams} />
          </Suspense>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="By plan">
          <Suspense fallback={<ChartSkeleton />}>
            <Plans searchParams={searchParams} />
          </Suspense>
        </ChartCard>
        <ChartCard title="By delivery zone">
          <Suspense fallback={<ChartSkeleton />}>
            <Zones searchParams={searchParams} />
          </Suspense>
        </ChartCard>
      </div>
    </div>
  );
}

async function Filters() {
  const { plans, zones } = await getFilterOptions();
  // Same field names the ticket queue reads, so a filtered view links straight through.
  const spec: FacetDef[] = [
    { kind: "dateRange", field: "createdAt", label: "Raised" },
    {
      kind: "multi",
      field: "category",
      label: "Category",
      options: TICKET_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) })),
    },
    {
      kind: "multi",
      field: "subcategory",
      label: "Sub-category",
      dependsOn: "category",
      options: TICKET_CATEGORIES.flatMap((c) =>
        SUBCATEGORIES[c].map((s) => ({ value: s.value, label: s.label, parent: c })),
      ),
    },
    { kind: "multi", field: "status", label: "Status", options: STATUS_OPTIONS.map((s) => ({ ...s })) },
    { kind: "multi", field: "priority", label: "Priority", options: PRIORITY_OPTIONS.map((p) => ({ ...p })) },
    { kind: "multi", field: "plan", label: "Plan", options: plans },
    { kind: "multi", field: "zone", label: "Zone", options: zones },
  ];
  return <ListSearchFilters spec={spec} />;
}

async function Kpis({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseComplaintFilters(await searchParams);
  const k = await getComplaintKpis(filters);
  return (
    <MetricTiles
      cols={3}
      items={[
        { label: "Total complaints", value: k.total, href: ticketsHref(filters) },
        {
          label: "Open",
          value: k.open,
          href: ticketsHref(filters, { statuses: ["open", "in_progress", "waiting_on_customer"] }),
        },
        {
          label: "Resolved",
          value: k.resolved,
          href: ticketsHref(filters, { statuses: ["resolved", "closed"] }),
        },
        {
          label: "Resolution rate",
          value: k.resolutionRatePct != null ? `${k.resolutionRatePct}%` : "—",
          hint: k.resolutionRatePct == null ? "No complaints in range" : undefined,
        },
        {
          label: "Avg. resolution time",
          value: k.avgResolutionHours != null ? `${k.avgResolutionHours}h` : "—",
          hint: k.avgResolutionHours == null ? "Nothing resolved yet" : undefined,
        },
        {
          label: "Per 100 tiffins",
          value: k.perHundredTiffins != null ? k.perHundredTiffins : "—",
          hint:
            k.perHundredTiffins != null
              ? `${k.deliveredTiffins.toLocaleString()} tiffins delivered`
              : "No tiffins delivered in range",
        },
      ]}
    />
  );
}

async function NeedsAttentionSection({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseComplaintFilters(await searchParams);
  const a = await getNeedsAttention(filters);
  if (a.urgent + a.overdue + a.unanswered + a.repeatCustomers === 0) return null;

  const cards = [
    {
      label: "High & critical, still open",
      value: a.urgent,
      icon: AlertTriangleIcon,
      href: ticketsHref(filters, {
        priorities: ["high", "urgent"],
        statuses: ["open", "in_progress", "waiting_on_customer"],
      }),
    },
    {
      label: "Overdue (no reply in 24h)",
      value: a.overdue,
      icon: ClockIcon,
      href: ticketsHref(filters, { statuses: ["open", "in_progress"] }),
    },
    { label: "Never answered", value: a.unanswered, icon: InboxIcon, href: ticketsHref(filters, { statuses: ["new"] }) },
    { label: "Customers complaining repeatedly", value: a.repeatCustomers, icon: RepeatIcon },
  ].filter((c) => c.value > 0);

  return (
    <SectionCard title="Needs attention" subtitle="Complaints that should not wait.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const inner = (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <c.icon className="text-warn size-5 shrink-0" />
              <div className="min-w-0">
                <p className="nums text-xl font-semibold tabular-nums">{c.value}</p>
                <p className="text-muted-foreground truncate text-xs">{c.label}</p>
              </div>
            </div>
          );
          return c.href ? (
            <Link key={c.label} href={c.href} className="hover:bg-muted/40 block rounded-lg transition-colors">
              {inner}
            </Link>
          ) : (
            <div key={c.label}>{inner}</div>
          );
        })}
      </div>
    </SectionCard>
  );
}

async function Trend({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseComplaintFilters(await searchParams);
  const rows = await getComplaintTrend(filters);
  if (rows.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">No complaints in this range.</p>;
  }
  return <TrendLineChart data={rows} xKey="day" yKey="n" />;
}

async function Categories({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filters = parseComplaintFilters(sp);
  const rows = await getByCategory(filters);
  const drill = sp.drill;
  return (
    <BreakdownList
      rows={rows.map((r) => ({
        label: r.category,
        n: r.n,
        // Selecting a category drills in place; the link keeps every other filter.
        href: `?${new URLSearchParams({ ...(sp as Record<string, string>), drill: r.value }).toString()}`,
        active: drill === r.value,
        muted: !r.isComplaint,
        meta: r.isComplaint ? undefined : "Not counted as a complaint",
      }))}
    />
  );
}

async function Subcategories({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filters = parseComplaintFilters(sp);
  const category = sp.drill;
  if (!category) {
    return <p className="text-muted-foreground py-8 text-center text-sm">Pick a category to break it down.</p>;
  }
  const rows = await getBySubcategory(filters, category);
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

async function Statuses({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseComplaintFilters(await searchParams);
  const rows = await getStatusMix(filters);
  return (
    <BreakdownList
      rows={rows.map((r) => ({ label: r.status, n: r.n, href: ticketsHref(filters, { statuses: [r.value] }) }))}
    />
  );
}

async function Priorities({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseComplaintFilters(await searchParams);
  const rows = await getPriorityMix(filters);
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

async function TopIssuesSection({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseComplaintFilters(await searchParams);
  const rows = await getTopIssues(filters);
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

async function RepeatCustomers({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseComplaintFilters(await searchParams);
  const rows = await getRepeatCustomers(filters);
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

async function Plans({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseComplaintFilters(await searchParams);
  const rows = await getByPlan(filters);
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

async function Zones({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseComplaintFilters(await searchParams);
  const rows = await getByZone(filters);
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
