"use client";

import { useState } from "react";
import { FolderTreeIcon, PencilIcon } from "lucide-react";
import {
  DataTable,
  ListPagination,
  SkeletonFilterBar,
  type Column,
  type FacetDef,
} from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { Button } from "@realm/ui/button";
import { TableCell } from "@realm/ui/table";
import { ColorSwatch } from "@/components/products/clover-color-swatch";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@/lib/list/sort";
import type { CategoryListRow, CategorySortColumn } from "@/lib/services/inventory.service";
import { CategoryEditDialog } from "./category-edit-dialog";

// Sortable keys must match CategorySortColumn; the rest are display-only.
type CategoryCol = CategorySortColumn | "color" | "clover" | "actions";

const COLUMNS: readonly Column<CategoryCol>[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "color", label: "Colour", sortable: false },
  { key: "order", label: "Order", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "clover", label: "Clover id", sortable: false },
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

export function CategoriesTable({
  spec,
  rows,
  total,
  page,
  size,
  sort,
}: {
  spec: FacetDef[];
  rows: CategoryListRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<CategorySortColumn>;
}) {
  const [editing, setEditing] = useState<CategoryListRow | null>(null);

  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        serial={false}
        sort={sort}
        search={{
          placeholder: "Search categories…",
          shortPlaceholder: "Search…",
          debounceMs: 250,
        }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={FolderTreeIcon}
        emptyMessage="No categories yet. Connect Clover and run Sync from Clover."
        emptySearchMessage="No categories match your filters."
        renderRow={(r) => (
          <>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell>
              <ColorSwatch colorCode={r.colorCode} />
            </TableCell>
            <TableCell>{r.sortOrder}</TableCell>
            <TableCell>
              <Badge variant={r.active ? "default" : "outline"}>
                {r.active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs">
              {r.cloverCategoryId ?? "—"}
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
      {/* key remounts the form for each row, so its fields reseed from the new category. */}
      <CategoryEditDialog
        key={editing?.publicId ?? "none"}
        category={editing}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </div>
  );
}

export function CategoriesTableSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonFilterBar dropdown />
      <DataTable.Skeleton columns={COLUMNS} serial={false} />
    </div>
  );
}
