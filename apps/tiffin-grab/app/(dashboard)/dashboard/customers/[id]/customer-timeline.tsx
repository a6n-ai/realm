"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardListIcon, HistoryIcon, PackageIcon } from "lucide-react";
import { DataTable, SearchInput, type Column } from "@/components/ds";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";
import { TableCell } from "@realm/ui/table";
import { formatEpoch } from "@/lib/format/datetime";
import type { getCustomer360 } from "@/lib/services/customers.service";

type TimelineEntry = Awaited<ReturnType<typeof getCustomer360>>["timeline"][number];

const KIND_ICON = { order: PackageIcon, inquiry: ClipboardListIcon } as const;
const KIND_LABEL = { order: "Order", inquiry: "Inquiry" } as const;

function entryHref(e: TimelineEntry): string {
  const id = e.id.slice(e.id.indexOf(":") + 1);
  return e.kind === "order" ? `/dashboard/orders/${id}` : `/dashboard/inquiries/${id}`;
}

// Same DataTable + local search/filter shape as customer-orders-table.tsx /
// customer-inquiries-table.tsx — consistent listing across all three sections
// on this page, rather than a bespoke feed layout just for activity.
export const CUSTOMER_TIMELINE_COLUMNS: readonly Column<"type" | "label" | "time">[] = [
  { key: "type", label: "Type", width: "w-28" },
  { key: "label", label: "Event" },
  { key: "time", label: "Time", align: "right" },
];

export function CustomerTimeline({ entries, timezone }: { entries: TimelineEntry[]; timezone: string }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");

  const kinds = useMemo(() => [...new Set(entries.map((e) => e.kind))], [entries]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (kind !== "all" && e.kind !== kind) return false;
      if (!needle) return true;
      return e.label.toLowerCase().includes(needle);
    });
  }, [entries, q, kind]);

  return (
    <DataTable
      columns={CUSTOMER_TIMELINE_COLUMNS}
      rows={filtered}
      rowKey={(e) => e.id}
      idHref={entryHref}
      rowClassName={() => "group cursor-pointer"}
      emptyIcon={HistoryIcon}
      emptyMessage="No activity yet."
      emptySearchMessage="No activity matches your search."
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search activity…" shortPlaceholder="Search…" />
          {entries.length > 0 && (
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger size="sm" className="w-32">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {kinds.map((k) => (
                  <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      }
      renderRow={(e) => {
        const Icon = KIND_ICON[e.kind];
        return (
          <>
            <TableCell>
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                <Icon className="size-3.5" /> {KIND_LABEL[e.kind]}
              </span>
            </TableCell>
            <TableCell className="font-medium">
              <Link href={entryHref(e)} className="group-hover:underline">
                {e.label}
              </Link>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatEpoch(e.at, { mode: "datetime", timeZone: timezone })}
            </TableCell>
          </>
        );
      }}
    />
  );
}
