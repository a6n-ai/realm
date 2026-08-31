"use client";

import { useState } from "react";
import { LayersIcon, PencilIcon } from "lucide-react";
import {
  DataTable,
  ListPagination,
  SkeletonFilterBar,
  type Column,
  type FacetDef,
} from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { TableCell } from "@foundry/ui/table";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@/lib/list/sort";
import type {
  ModifierGroupListRow,
  ModifierGroupSortColumn,
} from "@/lib/services/inventory.service";
import { ModifierGroupEditDialog } from "./modifier-group-edit-dialog";

// Sortable keys must match ModifierGroupSortColumn; the rest are display-only.
type ModifierGroupCol = ModifierGroupSortColumn | "modifiers" | "rules" | "actions";

const COLUMNS: readonly Column<ModifierGroupCol>[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "modifiers", label: "Modifiers", sortable: false },
  { key: "rules", label: "Selection", sortable: false },
  { key: "order", label: "Order", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "synced", label: "Last synced", sortable: true, align: "right" },
  { key: "actions", label: "", sortable: false, align: "right" },
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

/** "2–4", "min 1", "up to 3", or "—" when Clover sets no constraint. */
function selectionRule(min: number | null, max: number | null): string {
  if (min == null && max == null) return "—";
  if (min != null && max != null) return min === max ? `exactly ${min}` : `${min}–${max}`;
  return min != null ? `min ${min}` : `up to ${max}`;
}

export function ModifierGroupsTable({
  spec,
  rows,
  total,
  page,
  size,
  sort,
}: {
  spec: FacetDef[];
  rows: ModifierGroupListRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<ModifierGroupSortColumn>;
}) {
  const [editing, setEditing] = useState<ModifierGroupListRow | null>(null);

  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        serial={false}
        sort={sort}
        search={{
          placeholder: "Search modifier groups…",
          shortPlaceholder: "Search…",
          debounceMs: 250,
        }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={LayersIcon}
        emptyMessage="No modifier groups yet. Connect Clover and run Sync from Clover."
        emptySearchMessage="No modifier groups match your filters."
        renderRow={(r) => (
          <>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{r.name}</span>
                {r.alternateName ? (
                  <span className="text-muted-foreground text-xs">{r.alternateName}</span>
                ) : null}
              </div>
            </TableCell>
            <TableCell>
              {r.modifierCount} modifier{r.modifierCount === 1 ? "" : "s"}
            </TableCell>
            <TableCell className="text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <span>{selectionRule(r.minRequired, r.maxAllowed)}</span>
                {r.showByDefault ? (
                  <Badge variant="outline" className="text-[10px]">
                    Shown by default
                  </Badge>
                ) : null}
              </div>
            </TableCell>
            <TableCell>{r.sortOrder}</TableCell>
            <TableCell>
              <Badge variant={r.active ? "default" : "outline"}>
                {r.active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground text-right text-sm">
              {relativeTime(r.cloverLastSyncedAt)}
            </TableCell>
            <TableCell className="text-right">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                aria-label={`Edit ${r.name}`}
                onClick={() => setEditing(r)}
              >
                <PencilIcon className="size-3.5" />
              </Button>
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
      {/* key remounts the form for each row, so its fields reseed from the new group. */}
      <ModifierGroupEditDialog
        key={editing?.publicId ?? "none"}
        group={editing}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </div>
  );
}

export function ModifierGroupsTableSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonFilterBar dropdown />
      <DataTable.Skeleton columns={COLUMNS} serial={false} />
    </div>
  );
}
