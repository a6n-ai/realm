"use client";

import { useMemo } from "react";
import { LayersIcon, PencilIcon } from "lucide-react";
import {
  DataTable,
  FilterPill,
  FilterSheet,
  RowActionButton,
  RowActions,
  type Column,
} from "@/components/ds";
import { TableCell } from "@realm/ui/table";
import { useUrlState } from "@/lib/list/use-url-state";
import type { SortState } from "@/lib/list/sort";
import { eventLabel } from "./template-status";
import { TEMPLATE_COLUMNS, type TemplateSortColumn } from "./template-columns";

export interface TemplateChannel {
  channel: string;
  locales: string[];
}
export interface TemplateStatus {
  event: string;
  channels: TemplateChannel[];
  updatedAt: number | null;
}

// Columns + sort-key type live in ./template-columns so the server-rendered
// skeleton can import them without crossing this module's "use client" boundary.
export type { TemplateSortColumn } from "./template-columns";

/** Display names per channel. Unknown/future channels fall back to a humanized label. */
const CHANNEL_LABEL: Record<string, string> = { email: "Email", in_app: "In-app", sms: "SMS", whatsapp: "WhatsApp" };
const label = (c: string) => CHANNEL_LABEL[c] ?? c.replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase());

type StatusFilter = "all" | "configured" | "missing";
const STATUS_PILLS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "configured", label: "Configured" },
  { key: "missing", label: "Not configured" },
];

// The label is precomputed so DataTable's client-side search can match the
// human-readable event name, not just the raw enum key.
type Row = {
  event: string;
  label: string;
  channels: TemplateChannel[];
  updatedAt: number | null;
};

// Single source of truth for the header — DataTable and DataTable.Skeleton both
// render from this array, so the loading twin can never drift.

function ChannelsCell({ channels }: { channels: TemplateChannel[] }) {
  if (channels.length === 0) return <span className="text-xs text-muted-foreground">Not configured</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {channels.map((c) => (
        <span
          key={c.channel}
          className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs"
        >
          {label(c.channel)}
          <span className="font-mono text-[10px] uppercase text-muted-foreground">{c.locales.join("·")}</span>
        </span>
      ))}
    </span>
  );
}

function fmt(ms: number | null): string {
  return ms ? new Date(ms).toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "—";
}

export function TemplateList({
  items,
  sort,
}: {
  items: TemplateStatus[];
  sort: SortState<TemplateSortColumn>;
}) {
  const [status, setStatus] = useUrlState("status", "all");

  const rows = useMemo<Row[]>(
    () => items.map((i) => ({ ...i, label: eventLabel(i.event) })),
    [items],
  );

  // Status counts are search-independent, so they recompute only when rows change.
  const counts = useMemo(() => {
    let configured = 0;
    for (const r of rows) if (r.channels.length > 0) configured++;
    return { all: rows.length, configured, missing: rows.length - configured };
  }, [rows]);

  const statusRows = useMemo(
    () =>
      rows.filter((r) =>
        status === "configured"
          ? r.channels.length > 0
          : status === "missing"
            ? r.channels.length === 0
            : true,
      ),
    [rows, status],
  );

  return (
    <DataTable
      columns={TEMPLATE_COLUMNS}
      rows={statusRows}
      rowKey={(r) => r.event}
      sort={sort}
      search={{ placeholder: "Search events…", shortPlaceholder: "Search…", keys: ["label", "event"] }}
      rowClassName={() => "group cursor-pointer"}
      filters={
        <>
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            {STATUS_PILLS.map((p) => (
              <FilterPill
                key={p.key}
                label={p.label}
                active={status === p.key}
                count={counts[p.key]}
                onClick={() => setStatus(p.key)}
              />
            ))}
          </div>
          <div className="md:hidden">
            <FilterSheet iconOnly activeCount={status === "all" ? 0 : 1}>
              <div className="flex flex-wrap gap-2">
                {STATUS_PILLS.map((p) => (
                  <FilterPill
                    key={p.key}
                    label={p.label}
                    active={status === p.key}
                    count={counts[p.key]}
                    onClick={() => setStatus(p.key)}
                  />
                ))}
              </div>
            </FilterSheet>
          </div>
        </>
      }
      emptyIcon={LayersIcon}
      emptyMessage="No events."
      emptySearchMessage="No events match your search."
      renderRow={(r) => {
        const href = `/dashboard/notifications/templates/${r.event}`;
        return (
          <>
            <TableCell className="font-medium">{r.label}</TableCell>
            <TableCell>
              <ChannelsCell channels={r.channels} />
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(r.updatedAt)}</TableCell>
            <TableCell>
              <RowActions>
                <RowActionButton icon={PencilIcon} label="Edit templates" href={href} />
              </RowActions>
            </TableCell>
          </>
        );
      }}
    />
  );
}
