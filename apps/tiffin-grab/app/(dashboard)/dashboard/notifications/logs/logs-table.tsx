"use client";

import { useState, type ReactNode } from "react";
import { BellIcon } from "lucide-react";
import { DataTable, ListPagination, ResponsiveDialog, type Column, type FacetDef } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { TableCell } from "@foundry/ui/table";
import { Badge } from "@foundry/ui/badge";
import { eventLabel } from "@relay/engine/ui";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
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
  const tz = useTimezone();
  const fmt = (ms: number) => formatEpoch(ms, { mode: "datetime", timeZone: tz });
  const [selected, setSelected] = useState<Row | null>(null);
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        onRowClick={(r) => setSelected(r)}
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
              {fmt(r.createdAt)}
            </TableCell>
            <TableCell>{eventLabel(r.event)}</TableCell>
            <TableCell className="text-muted-foreground">{r.channel}</TableCell>
            <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
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

      <ResponsiveDialog
        open={selected != null}
        onOpenChange={(o) => !o && setSelected(null)}
        title={selected ? eventLabel(selected.event) : ""}
        description={selected?.publicId}
      >
        {selected && (
          <div className="space-y-4 p-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <span className={STATUS_STYLE[selected.status] ?? "text-muted-foreground"}>
                  {selected.status}
                </span>
                {selected.attempts > 1 && (
                  <span className="ml-1 text-xs text-muted-foreground">×{selected.attempts}</span>
                )}
              </Field>
              <Field label="Channel">
                <Badge variant="outline">{selected.channel}</Badge>
              </Field>
              <Field label="Recipient">{selected.email ?? "—"}</Field>
              <Field label="Queued at">{fmt(selected.createdAt)}</Field>
              <Field label="Provider message ID">{selected.providerMessageId ?? "—"}</Field>
              <Field label="Attempts">{selected.attempts}</Field>
            </div>
            {selected.lastError && (
              <Field label="Last error">
                <p className="whitespace-pre-wrap text-destructive">{selected.lastError}</p>
              </Field>
            )}
          </div>
        )}
      </ResponsiveDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="font-medium">{children}</div>
    </div>
  );
}

// Loading twin is now owned by DataTable — same COLUMNS, zero drift.
export function LogsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
