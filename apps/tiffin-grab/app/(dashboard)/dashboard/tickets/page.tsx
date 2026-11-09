import { Suspense } from "react";
import { count } from "drizzle-orm";
import { LifeBuoyIcon, InboxIcon, AlertCircleIcon, CheckCircleIcon, HourglassIcon, TicketIcon } from "lucide-react";
import { StatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { db } from "@/db/client";
import { tickets } from "@/db/schema";
import { AdminOnly, requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { getSupportHours } from "@/lib/services/app-settings.service";
import { SupportHoursDialog } from "./support-hours-dialog";
import { ticketsService } from "@/lib/services/tickets.service";
import { parseComplaintFilters, type ComplaintSearchParams } from "@/lib/services/analytics/complaint-filters";
import { parseSort } from "@foundry/design-system/list-sort";
import { parseFilterState } from "@/components/ds";
import {
  PageShell,
  PageHeader,
  SectionCard,
} from "@/components/ds";
import { TicketsList, TicketsListSkeleton } from "./tickets-list";
import { MarkSectionRead } from "@/components/dashboard/mark-section-read";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { epochBoundsWhere, withDefaultMonth, withListDates } from "@/lib/list/default-month";
import { ticketsListHref } from "@/lib/list/tickets-drill";

const SORT_COLUMNS = [
  "subject",
  "customer",
  "category",
  "status",
  "owner",
  "priority",
  "lastMessage",
  "created",
] as const;

type TicketSearchParams = Promise<
  { sort?: string; dir?: string; q?: string; owner?: string; page?: string; size?: string } & ComplaintSearchParams
>;

// The pills put "all" / "overdue" in ?status=; neither is a stored status, so they
// are peeled off before the rest goes through the shared complaint filters.
function queueParams(sp: Awaited<TicketSearchParams>) {
  const overdue = sp.status === "overdue";
  const status = sp.status === "all" || overdue ? undefined : sp.status;
  return { filters: parseComplaintFilters({ ...sp, status }), overdue };
}

export default function TicketsPage({ searchParams }: { searchParams: TicketSearchParams }) {
  return (
    <PageShell>
      <MarkSectionRead section="tickets" />
      <PageHeader
        icon={LifeBuoyIcon}
        title="Tickets"
        actions={
          <Suspense fallback={null}>
            <SupportHoursAction />
          </Suspense>
        }
      />
      {/* The date range filters the cards: one group, tighter than the page rhythm. */}
      <div className="flex flex-col gap-3">
        <div className="flex">
          <SectionDateRange />
        </div>
        <Suspense fallback={<StatCardsSkeleton count={5} />}>
          <TicketStats searchParams={searchParams} />
        </Suspense>
      </div>

      <SectionCard title="All tickets">
        <Suspense fallback={<TicketsListSkeleton />}>
          <TicketsData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

// Admins only: the hours are a promise to customers.
async function SupportHoursDialogLoader() {
  return <SupportHoursDialog value={await getSupportHours()} />;
}

async function SupportHoursAction() {
  await requireStaff();
  return (
    <AdminOnly>
      <SupportHoursDialogLoader />
    </AdminOnly>
  );
}

async function TicketStats({ searchParams }: { searchParams: TicketSearchParams }) {
  await requireStaff();
  const sp = await withDefaultMonth(await searchParams);
  // Cards are the date-range overview. A status on the URL (including the overdue drill) filters the list only.
  const filters = parseComplaintFilters({ from: sp.from, to: sp.to });

  const [statusCounts, { overdueCount: overdue }] = await Promise.all([
    db.select({ status: tickets.status, n: count() }).from(tickets).where(epochBoundsWhere(tickets.createdAt, sp)).groupBy(tickets.status),
    ticketsService.listQueuePage(undefined, filters, { page: { page: 0, size: 1 } }),
  ]);

  const countOf = (...statuses: string[]) =>
    statusCounts.filter((r) => statuses.includes(r.status)).reduce((sum, r) => sum + r.n, 0);

  const open = countOf("open", "in_progress", "waiting_on_customer");
  const resolved = countOf("resolved", "closed");
  const href = (status?: string) => ticketsListHref(sp, status ? { status } : {});

  return (
    <StatCards
      items={[
        { icon: TicketIcon, label: "Created", value: countOf("open", "in_progress", "waiting_on_customer", "resolved", "closed"), hint: "in selected dates", href: href() },
        { icon: InboxIcon, label: "Open", value: open, hint: "open · in-progress · waiting", href: href("open,in_progress,waiting_on_customer") },
        { icon: HourglassIcon, label: "Waiting on customer", value: countOf("waiting_on_customer"), hint: "staff replied, customer hasn't", href: href("waiting_on_customer") },
        { icon: AlertCircleIcon, label: "Overdue", value: overdue, hint: "waiting on staff > 24h", tone: overdue > 0 ? "bad" : undefined, href: href("overdue") },
        { icon: CheckCircleIcon, label: "Resolved", value: resolved, hint: "resolved · closed", href: href("resolved,closed") },
      ]}
    />
  );
}

async function TicketsData({ searchParams }: { searchParams: TicketSearchParams }) {
  await requireStaff();

  const sp = await withListDates(await searchParams);
  const sort = parseSort(sp, SORT_COLUMNS, {
    column: "lastMessage",
    dir: "desc",
  });
  // Complaint analytics links here with these params, so the queue lands on
  // exactly the tickets the chart or metric counted.
  const { filters, overdue } = queueParams(sp);
  const { page } = parseFilterState([], sp);

  const [statusCounts, result, owners] = await Promise.all([
    db.select({ status: tickets.status, n: count() }).from(tickets).where(epochBoundsWhere(tickets.createdAt, sp)).groupBy(tickets.status),
    ticketsService.listQueuePage(sort, filters, { page, overdue, ownerId: sp.owner, q: sp.q }),
    ticketsService.listQueueOwners(),
  ]);

  return (
    <TicketsList
      rows={result.items}
      total={result.total}
      page={page.page}
      size={page.size}
      overdueCount={result.overdueCount}
      owners={owners}
      statusCounts={statusCounts}
      sort={sort}
    />
  );
}
