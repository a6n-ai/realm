"use client";

import { ShieldOffIcon } from "lucide-react";
import { DataTable, ListPagination, type Column, type FacetDef } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { TableCell } from "@foundry/ui/table";
import { Badge } from "@foundry/ui/badge";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { SortState } from "@/lib/list/sort";

export type SuppressedSortColumn = "time" | "address" | "channel" | "scope" | "reason";

type Row = {
  publicId: string;
  address: string;
  channel: string;
  scope: string;
  reason: string;
  createdAt: number;
};

const COLUMNS: readonly Column<SuppressedSortColumn>[] = [
  { key: "time", label: "Time", sortable: true },
  { key: "address", label: "Address", sortable: true },
  { key: "channel", label: "Channel", sortable: true },
  { key: "scope", label: "Scope", sortable: true },
  { key: "reason", label: "Reason", sortable: true },
];

export function SuppressedTable({
  spec,
  rows,
  sort,
  total,
  page,
  size,
}: {
  spec: FacetDef[];
  rows: Row[];
  sort: SortState<SuppressedSortColumn>;
  total: number;
  page: number;
  size: number;
}) {
  const tz = useTimezone();
  const fmt = (ms: number) => formatEpoch(ms, { mode: "datetime", timeZone: tz });
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        search={{
          placeholder: "Search addresses…",
          shortPlaceholder: "Search…",
          debounceMs: 300,
        }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={ShieldOffIcon}
        emptyMessage="No suppressed addresses."
        emptySearchMessage="No suppressed addresses match your search."
        renderRow={(r) => (
          <>
            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{fmt(r.createdAt)}</TableCell>
            <TableCell className="text-sm">{r.address}</TableCell>
            <TableCell className="text-muted-foreground">{r.channel}</TableCell>
            <TableCell>
              <Badge variant={r.scope === "all" ? "destructive" : "outline"}>{r.scope}</Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{r.reason}</TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function SuppressedTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
