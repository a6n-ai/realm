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
import { TableCell } from "@foundry/ui/table";
import { useUrlState } from "@/lib/list/use-url-state";
import type { SortState } from "@/lib/list/sort";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import { eventLabel } from "@relay/engine/ui";
import { CATEGORY_LABEL, EVENT_CATEGORIES, eventCategory, type EventCategory } from "@/lib/notifications/event-categories";
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
  category: EventCategory;
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

export function TemplateList({
  items,
  sort,
}: {
  items: TemplateStatus[];
  sort: SortState<TemplateSortColumn>;
}) {
  const tz = useTimezone();
  const fmt = (ms: number | null) => (ms ? formatEpoch(ms, { mode: "date", timeZone: tz }) : "—");
  const [status, setStatus] = useUrlState("status", "all");
  const [type, setType] = useUrlState("type", "all");

  const rows = useMemo<Row[]>(
    () => items.map((i) => ({ ...i, label: eventLabel(i.event), category: eventCategory(i.event) })),
    [items],
  );

  // Status counts are search-independent, so they recompute only when rows change.
  const counts = useMemo(() => {
    let configured = 0;
    for (const r of rows) if (r.channels.length > 0) configured++;
    return { all: rows.length, configured, missing: rows.length - configured };
  }, [rows]);

  const typeCounts = useMemo(() => {
    const c: Partial<Record<EventCategory, number>> = {};
    for (const r of rows) c[r.category] = (c[r.category] ?? 0) + 1;
    return c;
  }, [rows]);

  const statusRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          (type === "all" || r.category === type) &&
          (status === "configured"
            ? r.channels.length > 0
            : status === "missing"
              ? r.channels.length === 0
              : true),
      ),
    [rows, status, type],
  );

  const typePills = (
    <>
      <FilterPill label="All types" active={type === "all"} count={rows.length} onClick={() => setType("all")} />
      {EVENT_CATEGORIES.map((c) => (
        <FilterPill
          key={c}
          label={CATEGORY_LABEL[c]}
          active={type === c}
          count={typeCounts[c] ?? 0}
          onClick={() => setType(c)}
        />
      ))}
    </>
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
            <span className="bg-border mx-1 h-5 w-px" aria-hidden />
            {typePills}
          </div>
          <div className="md:hidden">
            <FilterSheet iconOnly activeCount={(status === "all" ? 0 : 1) + (type === "all" ? 0 : 1)}>
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
              <div className="mt-3 flex flex-wrap gap-2">{typePills}</div>
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
              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{CATEGORY_LABEL[r.category]}</span>
            </TableCell>
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
