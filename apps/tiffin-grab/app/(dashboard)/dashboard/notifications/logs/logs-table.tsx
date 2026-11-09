"use client";

import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import { useState, type ReactNode } from "react";
import { BellIcon } from "lucide-react";
import { DataTable, ListPagination, ResponsiveDialog, type Column, type FacetDef } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/filters";
import { TableCell } from "@foundry/ui/table";
import { Badge } from "@foundry/ui/badge";
import { eventLabel } from "@relay/engine/ui/template-status";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import type { SortState } from "@foundry/design-system/list-sort";
import type { LogSortColumn } from "@/lib/notifications/logs-query";

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
  recipientEmail: string | null;
  deliveredAt: number | null;
  openedAt: number | null;
  clickedAt: number | null;
  bouncedAt: number | null;
  complainedAt: number | null;
  delayedAt: number | null;
  rejectedAt: number | null;
  renderFailedAt: number | null;
};

const STAMPS = [
  ["delivered", "deliveredAt", "text-ok"],
  ["opened", "openedAt", "text-ok"],
  ["clicked", "clickedAt", "text-ok"],
  ["delayed", "delayedAt", "text-warn"],
  ["bounced", "bouncedAt", "text-bad"],
  ["complained", "complainedAt", "text-bad"],
  ["rejected", "rejectedAt", "text-bad"],
  ["render failed", "renderFailedAt", "text-bad"],
] as const;

/** Latest SES event stamped on the row, or the queue status when SES reported nothing. */
function latestStatus(r: Row): { label: string; style: string } {
  const hit = STAMPS.filter(([, k]) => r[k] != null).sort((a, b) => r[b[1]]! - r[a[1]]!)[0];
  return hit
    ? { label: hit[0], style: hit[2] }
    : { label: r.status, style: STATUS_STYLE[r.status] ?? "text-muted-foreground" };
}

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
        serialOffset={pageOffset(page, size)}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        idAccessor={(r) => r.publicId}
        onRowClick={(r) => setSelected(r)}
        search={{
          placeholder: "Search notifications…",
          shortPlaceholder: "Search…",
          debounceMs: 300,
        }}
        filters={<ReuiFacetFilters spec={spec} hideDate />}
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
            <TableCell className="text-muted-foreground">{r.email ?? r.recipientEmail ?? "—"}</TableCell>
            <TableCell>
              <span className={latestStatus(r).style}>{latestStatus(r).label}</span>
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
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <span className={latestStatus(selected).style}>{latestStatus(selected).label}</span>
                {selected.attempts > 1 && (
                  <span className="ml-1 text-xs text-muted-foreground">×{selected.attempts}</span>
                )}
              </Field>
              <Field label="Channel">
                <Badge variant="outline">{selected.channel}</Badge>
              </Field>
              <Field label="Recipient">{selected.email ?? selected.recipientEmail ?? "—"}</Field>
              <Field label="Queued at">{fmt(selected.createdAt)}</Field>
              <Field label="Provider message ID">{selected.providerMessageId ?? "—"}</Field>
              <Field label="Attempts">{selected.attempts}</Field>
              {STAMPS.filter(([, k]) => selected[k] != null).map(([label, k]) => (
                <Field key={k} label={label[0]!.toUpperCase() + label.slice(1)}>
                  {fmt(selected[k]!)}
                </Field>
              ))}
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
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
