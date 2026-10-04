"use client";

import Link from "next/link";
import { ChevronRightIcon, LifeBuoyIcon } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { DataTable, FilterPill, FilterSheet, ListPagination, useListNav, type Column } from "@/components/ds";
import { TableCell } from "@foundry/ui/table";
import { Badge } from "@foundry/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@foundry/ui/select";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { SortState } from "@/lib/list/sort";
import type { QueueRow, QueueSortColumn } from "@/lib/services/tickets.service";
import { ReassignControl } from "@/components/reassign/reassign-control";
import { assignOwner } from "./actions";
import { TicketStatusBadge, PriorityBadge, categoryLabel } from "./ticket-badges";

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
  total,
  page,
  size,
  overdueCount,
  owners,
  statusCounts,
  sort,
  staff,
  canReassign,
}: {
  rows: QueueRow[];
  total: number;
  page: number;
  size: number;
  overdueCount: number;
  owners: { publicId: string; name: string }[];
  statusCounts: { status: string; n: number }[];
  sort: SortState<QueueSortColumn>;
  staff: { publicId: string; name: string }[];
  canReassign: boolean;
}) {
  // Status, owner and search all filter on the server; a change resets to page 0.
  const tz = useTimezone();
  const nav = useListNav();
  const pathname = usePathname();
  const params = useSearchParams();
  const activeStatus = params.get("status") ?? "all";
  const owner = params.get("owner") ?? ALL_OWNERS;
  const setParam = (key: string, value: string, fallback: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value === fallback) sp.delete(key);
    else sp.set(key, value);
    sp.delete("page");
    const qs = sp.toString();
    nav(qs ? `${pathname}?${qs}` : pathname);
  };
  const setActiveStatus = (v: string) => setParam("status", v, "all");
  const setOwner = (v: string) => setParam("owner", v, ALL_OWNERS);

  const renderOwnerSelect = (triggerClassName: string) => (
    <Select value={owner} onValueChange={setOwner}>
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder="All owners" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_OWNERS}>All owners</SelectItem>
        {owners.map((o) => (
          <SelectItem key={o.publicId} value={o.publicId}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const countOf = (status: string) => {
    if (status === "all") return statusCounts.reduce((sum, r) => sum + r.n, 0);
    if (status === "overdue") return overdueCount;
    return statusCounts.find((r) => r.status === status)?.n ?? 0;
  };

  return (
    <div className="space-y-4">
      <DataTable
        serialOffset={page * size}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        idAccessor={(r) => r.publicId}
        idHref={(r) => `/dashboard/tickets/${r.publicId}`}
        search={{ placeholder: "Search tickets…", shortPlaceholder: "Search…", debounceMs: 300 }}
        rowClassName={() => "group cursor-pointer"}
        emptyIcon={LifeBuoyIcon}
        emptyMessage="No tickets yet."
        emptySearchMessage="No tickets match your search."
        filters={
          <>
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              {STATUS_PILLS.map((p) => (
                <FilterPill
                  key={p.key}
                  label={p.label}
                  active={activeStatus === p.key}
                  count={countOf(p.key)}
                  onClick={() => setActiveStatus(p.key)}
                />
              ))}
              {renderOwnerSelect("h-8 w-40")}
            </div>
            <div className="md:hidden">
              <FilterSheet
                iconOnly
                activeCount={(activeStatus === "all" ? 0 : 1) + (owner === ALL_OWNERS ? 0 : 1)}
              >
                <div className="flex flex-wrap gap-2">
                  {STATUS_PILLS.map((p) => (
                    <FilterPill
                      key={p.key}
                      label={p.label}
                      active={activeStatus === p.key}
                      count={countOf(p.key)}
                      onClick={() => setActiveStatus(p.key)}
                    />
                  ))}
                </div>
                {renderOwnerSelect("w-full")}
              </FilterSheet>
            </div>
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
            <TableCell>{categoryLabel(r.category)}</TableCell>
            <TableCell>
              <span className="inline-flex items-center gap-2">
                <TicketStatusBadge status={r.status} />
                {r.overdue ? <Badge variant="destructive">Overdue</Badge> : null}
              </span>
            </TableCell>
            <TableCell>
              {canReassign ? (
                <ReassignControl
                  currentOwnerId={r.ownerId}
                  currentOwnerName={r.ownerName}
                  staff={staff}
                  action={(ownerId) => assignOwner(r.publicId, ownerId)}
                />
              ) : (
                (r.ownerName ?? "—")
              )}
            </TableCell>
            <TableCell>
              <PriorityBadge priority={r.priority} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.lastMessageAt != null
                ? formatEpoch(r.lastMessageAt, { mode: "datetime", timeZone: tz })
                : "—"}
            </TableCell>
            <TableCell>
              <ChevronRightIcon className="size-4 opacity-0 transition-opacity group-hover:opacity-60" />
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

// Loading twin is now owned by DataTable — same COLUMNS, zero drift.
export function TicketsListSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
