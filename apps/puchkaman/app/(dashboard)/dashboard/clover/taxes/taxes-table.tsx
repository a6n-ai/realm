"use client";

import { PercentIcon } from "lucide-react";
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
import type { TaxRateListRow, TaxRateSortColumn } from "@/lib/services/inventory.service";

type TaxCol = TaxRateSortColumn | "type" | "clover";

const COLUMNS: readonly Column<TaxCol>[] = [
  { key: "name", label: "Tax name", sortable: true },
  { key: "type", label: "Tax type", sortable: false },
  { key: "rate", label: "Tax rate", sortable: true, align: "right" },
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

/** Clover taxes are either a percentage or a flat cents amount, never both. */
function formatRate(row: TaxRateListRow): string {
  if (row.rate != null) {
    // Trim the stored 5dp scale back to what a human wrote: 13.00000 → 13%.
    return `${Number(row.rate.toFixed(5))}%`;
  }
  if (row.taxAmount != null) return `$${(row.taxAmount / 100).toFixed(2)}`;
  return "—";
}

export function TaxesTable({
  spec,
  rows,
  total,
  page,
  size,
  sort,
}: {
  spec: FacetDef[];
  rows: TaxRateListRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<TaxRateSortColumn>;
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
          placeholder: "Search taxes and fees…",
          shortPlaceholder: "Search…",
          debounceMs: 250,
        }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={PercentIcon}
        emptyMessage="No taxes or fees yet. Connect Clover and run Sync from Clover."
        emptySearchMessage="No taxes match your filters."
        renderRow={(r) => (
          <>
            <TableCell className="font-medium">
              <span className="inline-flex items-center gap-2">
                {r.name}
                {r.isDefault ? (
                  <Badge variant="secondary" className="text-[10px]">
                    Default
                  </Badge>
                ) : null}
              </span>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {r.taxType ?? (r.rate != null ? "Percentage" : "Flat")}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatRate(r)}</TableCell>
            <TableCell>
              <Badge variant={r.active ? "default" : "outline"}>
                {r.active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs">
              {r.cloverTaxRateId ?? "—"}
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

export function TaxesTableSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonFilterBar dropdown />
      <DataTable.Skeleton columns={COLUMNS} serial={false} />
    </div>
  );
}
