"use client";

import Link from "next/link";
import { ChevronRightIcon, LifeBuoyIcon } from "lucide-react";
import {
  FilterBar, FilterPill, SearchInput, EmptyState, SortableHeader,
} from "@/components/ds";
import type { SortState } from "@/lib/list/sort";
import {
  Table, TableHeader, TableHead, TableBody, TableRow, TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatEpoch } from "@/lib/format/datetime";
import { useUrlState, useClearUrlKeys } from "@/lib/list/use-url-state";
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

// Single source of truth for the table's columns. The real header, and the
// skeleton twin below, both render from this — change a column here and both
// update, so the loading skeleton can never drift from the component.
const COLUMNS = [
  { key: "subject", label: "Subject", sortable: true },
  { key: "customer", label: "Customer", sortable: true },
  { key: "category", label: "Category", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "owner", label: "Owner", sortable: true },
  { key: "priority", label: "Priority", sortable: true },
  { key: "lastMessage", label: "Last activity", sortable: true, align: "right" },
  { key: "chevron", label: "", width: "w-8" },
] as const;

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
  const [search, setSearch] = useUrlState("q", "");
  const [activeStatus, setActiveStatus] = useUrlState("status", "all");
  const [owner, setOwner] = useUrlState("owner", ALL_OWNERS);

  const clearUrlKeys = useClearUrlKeys();
  const hasFilters = !!search || activeStatus !== "all" || owner !== ALL_OWNERS;
  const clearFilters = () => clearUrlKeys(["q", "status", "owner"]);

  const owners = Array.from(
    new Set(rows.map((r) => r.ownerName).filter((n): n is string => !!n)),
  ).sort();

  const countOf = (status: string) => {
    if (status === "all") return rows.length;
    if (status === "overdue") return rows.filter((r) => r.overdue).length;
    return statusCounts.find((r) => r.status === status)?.n ?? 0;
  };

  const filtered = rows.filter((r) => {
    const matchStatus =
      activeStatus === "all" ||
      (activeStatus === "overdue" ? r.overdue : r.status === activeStatus);
    const matchOwner = owner === ALL_OWNERS || r.ownerName === owner;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.subject.toLowerCase().includes(q) ||
      (r.customerName?.toLowerCase().includes(q) ?? false);
    return matchStatus && matchOwner && matchSearch;
  });

  return (
    <div className="space-y-4">
      <FilterBar
        search={
          <SearchInput value={search} onChange={setSearch} placeholder="Search tickets…" />
        }
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
      />
      {filtered.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={LifeBuoyIcon}
            message="No tickets match your filter."
          />
        ) : (
          <EmptyState
            icon={LifeBuoyIcon}
            message="No tickets yet."
          />
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) =>
                "sortable" in c && c.sortable ? (
                  <SortableHeader
                    key={c.key}
                    column={c.key as QueueSortColumn}
                    label={c.label}
                    currentSort={sort.column}
                    currentDir={sort.dir}
                    className={"align" in c ? "text-right" : undefined}
                  />
                ) : (
                  <TableHead key={c.key} className={cn("align" in c && "text-right", "width" in c && c.width)}>
                    {c.label}
                  </TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.publicId} className="group cursor-pointer">
                <TableCell className="font-medium">
                  <Link
                    href={`/dashboard/tickets/${r.publicId}`}
                    className="group-hover:underline"
                  >
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
                <TableCell className="text-right">
                  <span className="nums">
                    {r.lastMessageAt != null
                      ? formatEpoch(r.lastMessageAt, { mode: "datetime" })
                      : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <ChevronRightIcon className="size-4 opacity-0 transition-opacity group-hover:opacity-60" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// Exact loading twin: same COLUMNS + same FilterBar/Table markup (search, pills
// and owner dropdown), grey cells instead of data. Rendered as the page's
// <Suspense fallback>, so it always matches TicketsList by construction.
export function TicketsListSkeleton() {
  return (
    <div className="space-y-4">
      <FilterBar
        search={<Skeleton className="h-9 w-full" />}
        filters={
          <>
            {STATUS_PILLS.map((p) => (
              <Skeleton key={p.key} className="h-8 w-16 rounded-full" />
            ))}
            <Skeleton className="h-8 w-40" />
          </>
        }
      />
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead key={c.key} className={cn("align" in c && "text-right", "width" in c && c.width)}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, r) => (
            <TableRow key={r}>
              {COLUMNS.map((c) => (
                <TableCell key={c.key} className={"align" in c ? "text-right" : undefined}>
                  <Skeleton
                    className={cn(
                      "h-4",
                      c.key === "chevron" ? "w-4" : "w-full max-w-32",
                      "align" in c && "ml-auto",
                    )}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
