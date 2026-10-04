import { Suspense } from "react";
import { count } from "drizzle-orm";
import { LifeBuoyIcon, InboxIcon, AlertCircleIcon, CheckCircleIcon } from "lucide-react";
import { db } from "@/db/client";
import { tickets } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { ticketsService } from "@/lib/services/tickets.service";
import { parseComplaintFilters, type ComplaintSearchParams } from "@/lib/services/analytics/complaint-filters";
import { listAssignableStaff } from "@/lib/services/assignable-staff";
import { canReassign } from "@/lib/services/reassign";
import { parseSort } from "@/lib/list/sort";
import { parseFilterState } from "@/components/ds";
import {
  PageShell,
  PageHeader,
  SectionCard,
  StatGrid,
  SkeletonStatCards,
} from "@/components/ds";
import { TicketsList, TicketsListSkeleton } from "./tickets-list";
import { MarkSectionRead } from "@/components/dashboard/mark-section-read";

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
      <PageHeader icon={LifeBuoyIcon} title="Tickets" />

      <Suspense fallback={<SkeletonStatCards count={3} className="grid-cols-2 sm:grid-cols-3" />}>
        <TicketStats />
      </Suspense>

      <SectionCard title="All tickets">
        <Suspense fallback={<TicketsListSkeleton />}>
          <TicketsData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function TicketStats() {
  await requireStaff();

  const [statusCounts, { overdueCount: overdue }] = await Promise.all([
    db.select({ status: tickets.status, n: count() }).from(tickets).groupBy(tickets.status),
    ticketsService.listQueuePage(undefined, undefined, { page: { page: 0, size: 1 } }),
  ]);

  const countOf = (...statuses: string[]) =>
    statusCounts.filter((r) => statuses.includes(r.status)).reduce((sum, r) => sum + r.n, 0);

  const open = countOf("open", "in_progress", "waiting_on_customer");
  const resolved = countOf("resolved", "closed");

  return (
    <StatGrid
      cols={3}
      items={[
        { icon: InboxIcon, label: "Open", value: open, hint: "open · in-progress · waiting" },
        { icon: AlertCircleIcon, label: "Overdue", value: overdue, hint: "waiting on staff > 24h" },
        { icon: CheckCircleIcon, label: "Resolved", value: resolved, hint: "resolved · closed" },
      ]}
    />
  );
}

async function TicketsData({ searchParams }: { searchParams: TicketSearchParams }) {
  await requireStaff();

  const sp = await searchParams;
  const sort = parseSort(sp, SORT_COLUMNS, {
    column: "lastMessage",
    dir: "desc",
  });
  // Complaint analytics links here with these params, so the queue lands on
  // exactly the tickets the chart or metric counted.
  const { filters, overdue } = queueParams(sp);
  const { page } = parseFilterState([], sp);

  const [statusCounts, result, owners, allowReassign] = await Promise.all([
    db.select({ status: tickets.status, n: count() }).from(tickets).groupBy(tickets.status),
    ticketsService.listQueuePage(sort, filters, { page, overdue, ownerId: sp.owner, q: sp.q }),
    ticketsService.listQueueOwners(),
    canReassign(),
  ]);
  const staff = allowReassign ? await listAssignableStaff() : [];

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
      staff={staff}
      canReassign={allowReassign}
    />
  );
}
