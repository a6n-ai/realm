import { count } from "drizzle-orm";
import { LifeBuoyIcon, InboxIcon, AlertCircleIcon, CheckCircleIcon } from "lucide-react";
import { db } from "@/db/client";
import { tickets } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { ticketsService } from "@/lib/services/tickets.service";
import { parseSort } from "@/lib/list/sort";
import { PageShell, PageHeader, SectionCard, StatCard } from "@/components/ds";
import { TicketsList } from "./tickets-list";

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  await requireStaff();

  const sort = parseSort(
    await searchParams,
    ["subject", "customer", "category", "status", "owner", "priority", "lastMessage", "created"],
    { column: "lastMessage", dir: "desc" },
  );

  const [statusCounts, [{ total }], rows] = await Promise.all([
    db.select({ status: tickets.status, n: count() }).from(tickets).groupBy(tickets.status),
    db.select({ total: count() }).from(tickets),
    ticketsService.listForQueue(sort),
  ]);

  const countOf = (...statuses: string[]) =>
    statusCounts.filter((r) => statuses.includes(r.status)).reduce((sum, r) => sum + r.n, 0);

  const open = countOf("open", "in_progress", "waiting_on_customer");
  const resolved = countOf("resolved", "closed");
  const overdue = rows.filter((r) => r.overdue).length;

  return (
    <PageShell>
      <PageHeader
        icon={LifeBuoyIcon}
        title="Tickets"
        subtitle={`${total} total · ${open} open`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={InboxIcon} label="Open" value={open} hint="open · in-progress · waiting" />
        <StatCard icon={AlertCircleIcon} label="Overdue" value={overdue} hint="waiting on staff > 24h" />
        <StatCard icon={CheckCircleIcon} label="Resolved" value={resolved} hint="resolved · closed" />
      </div>

      <SectionCard title="All tickets" subtitle={total === 0 ? "Nothing yet" : undefined}>
        <TicketsList rows={rows} statusCounts={statusCounts} sort={sort} />
      </SectionCard>
    </PageShell>
  );
}
