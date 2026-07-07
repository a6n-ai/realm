import { Suspense } from "react";
import { count } from "drizzle-orm";
import { LifeBuoyIcon, InboxIcon, AlertCircleIcon, CheckCircleIcon } from "lucide-react";
import { db } from "@/db/client";
import { tickets } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { ticketsService } from "@/lib/services/tickets.service";
import { parseSort } from "@/lib/list/sort";
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

export default function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  return (
    <PageShell>
      <MarkSectionRead section="tickets" />
      <PageHeader icon={LifeBuoyIcon} title="Tickets" />

      <Suspense fallback={<SkeletonStatCards count={3} className="grid-cols-2 sm:grid-cols-3" />}>
        <TicketStats searchParams={searchParams} />
      </Suspense>

      <SectionCard title="All tickets">
        <Suspense fallback={<TicketsListSkeleton />}>
          <TicketsData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function TicketStats({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  await requireStaff();

  const sort = parseSort(await searchParams, SORT_COLUMNS, {
    column: "lastMessage",
    dir: "desc",
  });

  const [statusCounts, rows] = await Promise.all([
    db.select({ status: tickets.status, n: count() }).from(tickets).groupBy(tickets.status),
    ticketsService.listForQueue(sort),
  ]);

  const countOf = (...statuses: string[]) =>
    statusCounts.filter((r) => statuses.includes(r.status)).reduce((sum, r) => sum + r.n, 0);

  const open = countOf("open", "in_progress", "waiting_on_customer");
  const resolved = countOf("resolved", "closed");
  const overdue = rows.filter((r) => r.overdue).length;

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

async function TicketsData({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  await requireStaff();

  const sort = parseSort(await searchParams, SORT_COLUMNS, {
    column: "lastMessage",
    dir: "desc",
  });

  const [statusCounts, rows] = await Promise.all([
    db.select({ status: tickets.status, n: count() }).from(tickets).groupBy(tickets.status),
    ticketsService.listForQueue(sort),
  ]);

  return <TicketsList rows={rows} statusCounts={statusCounts} sort={sort} />;
}
