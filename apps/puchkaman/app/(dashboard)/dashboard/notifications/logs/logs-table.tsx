"use client";

import { BellIcon } from "lucide-react";
import {
  DataTable,
  ListPagination,
  type Column,
  type FacetDef,
} from "@foundry/design-system";
import { TableCell } from "@foundry/ui/table";
import { eventLabel } from "@relay/engine/ui";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@/lib/list/sort";
import type { LogSortColumn } from "./page";

type Row = {
  publicId: string;
  /** Null for a campaign row, which has no business event. */
  event: string | null;
  channel: string;
  status: string;
  attempts: number;
  providerMessageId: string | null;
  lastError: string | null;
  createdAt: number;
  email: string | null;
  /** Literal address for a recipient with no account (imported contact). */
  recipientEmail: string | null;
};

// Single source of truth for the table's columns. DataTable renders the header
// and DataTable.Skeleton renders the loading twin from this same array, so the
// two can never drift.
const COLUMNS: readonly Column<LogSortColumn | "detail">[] = [
  { key: "time", label: "Time", sortable: true },
  { key: "event", label: "Event", sortable: true },
  { key: "channel", label: "Channel", sortable: true },
  { key: "recipient", label: "Recipient", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "detail", label: "Detail" },
];

const STATUS_STYLE: Record<string, string> = {
  sent: "text-ok",
  failed: "text-bad",
  pending: "text-muted-foreground",
  processing: "text-warn",
};

export function LogsTable({
  spec,
  rows,
  sort,
  total,
  page,
  size,
}: {
  spec: FacetDef[];
  rows: Row[];
  sort: SortState<LogSortColumn>;
  total: number;
  page: number;
  size: number;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        search={{
          placeholder: "Search notifications…",
          shortPlaceholder: "Search…",
          debounceMs: 300,
        }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={BellIcon}
        emptyMessage="No notifications have been queued yet."
        emptySearchMessage="No notifications match your search."
        renderRow={(r) => (
          <>
            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
              {new Date(r.createdAt).toLocaleString()}
            </TableCell>
            <TableCell>{eventLabel(r.event)}</TableCell>
            <TableCell className="text-muted-foreground">{r.channel}</TableCell>
            {/* The user row wins, then the literal address a non-account
                recipient was queued with. */}
            <TableCell className="text-muted-foreground">{r.email ?? r.recipientEmail ?? "—"}</TableCell>
            <TableCell>
              <span className={STATUS_STYLE[r.status] ?? "text-muted-foreground"}>{r.status}</span>
              {r.attempts > 1 && (
                <span className="ml-1 text-xs text-muted-foreground">×{r.attempts}</span>
              )}
            </TableCell>
            <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
              {r.lastError ?? r.providerMessageId ?? ""}
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

// Loading twin is owned by DataTable — same COLUMNS, zero drift.
export function LogsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
