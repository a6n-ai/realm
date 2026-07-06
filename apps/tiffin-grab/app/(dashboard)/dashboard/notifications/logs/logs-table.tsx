"use client";

import { BellIcon } from "lucide-react";
import { DataTable, type Column } from "@/components/ds";
import { TableCell } from "@realm/ui/table";
import { eventLabel } from "@/components/notifications/template-status";
import type { SortState } from "@/lib/list/sort";
import type { LogSortColumn } from "./page";

type Row = {
  publicId: string;
  event: string;
  channel: string;
  status: string;
  attempts: number;
  providerMessageId: string | null;
  lastError: string | null;
  createdAt: number;
  email: string | null;
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

function fmt(ms: number): string {
  return new Date(ms).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

export function LogsTable({ rows, sort }: { rows: Row[]; sort: SortState<LogSortColumn> }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.publicId}
      sort={sort}
      search={{ placeholder: "Search notifications…", shortPlaceholder: "Search…", debounceMs: 300 }}
      emptyIcon={BellIcon}
      emptyMessage="No notifications have been queued yet."
      emptySearchMessage="No notifications match your search."
      renderRow={(r) => (
        <>
          <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{fmt(r.createdAt)}</TableCell>
          <TableCell>{eventLabel(r.event)}</TableCell>
          <TableCell className="text-muted-foreground">{r.channel}</TableCell>
          <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
          <TableCell>
            <span className={STATUS_STYLE[r.status] ?? "text-muted-foreground"}>{r.status}</span>
            {r.attempts > 1 && <span className="ml-1 text-xs text-muted-foreground">×{r.attempts}</span>}
          </TableCell>
          <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
            {r.lastError ?? r.providerMessageId ?? ""}
          </TableCell>
        </>
      )}
    />
  );
}

// Loading twin is now owned by DataTable — same COLUMNS, zero drift.
export function LogsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
