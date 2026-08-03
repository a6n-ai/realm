"use client";

import { PrinterIcon } from "lucide-react";
import {
  DataTable,
  ListPagination,
  SkeletonFilterBar,
  type Column,
  type FacetDef,
} from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { TableCell } from "@realm/ui/table";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@/lib/list/sort";
import type { PrinterLabelListRow, PrinterLabelSortColumn } from "@/lib/services/inventory.service";

type LabelCol = PrinterLabelSortColumn | "reporting" | "clover";

const COLUMNS: readonly Column<LabelCol>[] = [
  { key: "name", label: "Label name", sortable: true },
  { key: "reporting", label: "In reporting", sortable: false },
  { key: "status", label: "Status", sortable: true },
  { key: "clover", label: "Clover id", sortable: false },
  { key: "synced", label: "Last synced", sortable: true, align: "right" },
];

function relativeTime(ms: number | null): string {
  if (!ms) return "—";
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function LabelsTable({
  spec,
  rows,
  total,
  page,
  size,
  sort,
}: {
  spec: FacetDef[];
  rows: PrinterLabelListRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<PrinterLabelSortColumn>;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        serial={false}
        sort={sort}
        search={{
          placeholder: "Search labels…",
          shortPlaceholder: "Search…",
          debounceMs: 250,
        }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={PrinterIcon}
        emptyMessage="No printer labels yet. Create them in Clover, then run Sync from Clover."
        emptySearchMessage="No labels match your filters."
        renderRow={(r) => (
          <>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell>
              <Badge variant={r.showInReporting ? "secondary" : "outline"}>
                {r.showInReporting ? "Yes" : "No"}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={r.active ? "default" : "outline"}>
                {r.active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs">
              {r.cloverTagId ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground text-right text-sm">
              {relativeTime(r.cloverLastSyncedAt)}
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function LabelsTableSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonFilterBar dropdown />
      <DataTable.Skeleton columns={COLUMNS} serial={false} />
    </div>
  );
}
