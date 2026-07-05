"use client";

import Link from "next/link";
import { ChevronRightIcon, LifeBuoyIcon } from "lucide-react";
import { DataTable, FilterPill, type Column } from "@/components/ds";
import { TableCell } from "@realm/ui/table";
import { Badge } from "@realm/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@realm/ui/select";
import { formatEpoch } from "@/lib/format/datetime";
import { useUrlState } from "@/lib/list/use-url-state";
import type { SortState } from "@/lib/list/sort";
import type { QueueRow, QueueSortColumn } from "@/lib/services/tickets.service";
import { TicketStatusBadge, PriorityBadge, CATEGORY_LABEL } from "./ticket-badges";

const STATUS_PILLS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "waiting_on_customer", label: "Waiting" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
  { key: "overdue", label: "Overdue" },
] as const;

// Single source of truth for the table's columns. DataTable renders the header
// and DataTable.Skeleton renders the loading twin from this same array, so the
// two can never drift.
const COLUMNS: readonly Column<QueueSortColumn | "chevron">[] = [
  { key: "subject", label: "Subject", sortable: true },
  { key: "customer", label: "Customer", sortable: true },
  { key: "category", label: "Category", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "owner", label: "Owner", sortable: true },
  { key: "priority", label: "Priority", sortable: true },
  { key: "lastMessage", label: "Last activity", sortable: true, align: "right" },
  { key: "chevron", label: "", width: "w-8" },
];

const ALL_OWNERS = "__all__";

export function TicketsList({
  rows,
  statusCounts,
  sort,
}: {
  rows: QueueRow[];
  statusCounts: { status: string; n: number }[];
  sort: SortState<QueueSortColumn>;
}) {
  // Status + owner are client-side filters layered on top of DataTable's own
  // "q" search (which filters the rows we hand it via search.keys).
  const [activeStatus, setActiveStatus] = useUrlState("status", "all");
  const [owner, setOwner] = useUrlState("owner", ALL_OWNERS);

  const owners = Array.from(
    new Set(rows.map((r) => r.ownerName).filter((n): n is string => !!n)),
  ).sort();

  const countOf = (status: string) => {
    if (status === "all") return rows.length;
    if (status === "overdue") return rows.filter((r) => r.overdue).length;
    return statusCounts.find((r) => r.status === status)?.n ?? 0;
  };

  const scoped = rows.filter((r) => {
    const matchStatus =
      activeStatus === "all" ||
      (activeStatus === "overdue" ? r.overdue : r.status === activeStatus);
    const matchOwner = owner === ALL_OWNERS || r.ownerName === owner;
    return matchStatus && matchOwner;
  });

  return (
    <DataTable
      columns={COLUMNS}
      rows={scoped}
      rowKey={(r) => r.publicId}
      sort={sort}
      idAccessor={(r) => r.publicId}
      idHref={(r) => `/dashboard/tickets/${r.publicId}`}
      search={{ placeholder: "Search by subject, customer or ID…", keys: ["subject", "customerName"] }}
      rowClassName={() => "group cursor-pointer"}
      emptyIcon={LifeBuoyIcon}
      emptyMessage="No tickets yet."
      emptySearchMessage="No tickets match your search."
      filters={
        <>
          {STATUS_PILLS.map((p) => (
            <FilterPill
              key={p.key}
              label={p.label}
              active={activeStatus === p.key}
              count={countOf(p.key)}
              onClick={() => setActiveStatus(p.key)}
            />
          ))}
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="All owners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_OWNERS}>All owners</SelectItem>
              {owners.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
      renderRow={(r) => (
        <>
          <TableCell className="font-medium">
            <Link href={`/dashboard/tickets/${r.publicId}`} className="group-hover:underline">
              {r.subject}
            </Link>
          </TableCell>
          <TableCell>{r.customerName ?? "—"}</TableCell>
          <TableCell>{CATEGORY_LABEL[r.category] ?? r.category}</TableCell>
          <TableCell>
            <span className="inline-flex items-center gap-2">
              <TicketStatusBadge status={r.status} />
              {r.overdue ? <Badge variant="destructive">Overdue</Badge> : null}
            </span>
          </TableCell>
          <TableCell>{r.ownerName ?? "—"}</TableCell>
          <TableCell>
            <PriorityBadge priority={r.priority} />
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {r.lastMessageAt != null
              ? formatEpoch(r.lastMessageAt, { mode: "datetime" })
              : "—"}
          </TableCell>
          <TableCell>
            <ChevronRightIcon className="size-4 opacity-0 transition-opacity group-hover:opacity-60" />
          </TableCell>
        </>
      )}
    />
  );
}

// Loading twin is now owned by DataTable — same COLUMNS, zero drift.
export function TicketsListSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
