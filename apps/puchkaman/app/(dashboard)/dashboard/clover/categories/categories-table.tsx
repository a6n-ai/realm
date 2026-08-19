"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderTreeIcon, PencilIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
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
import { apiFetch } from "@/lib/http/api-fetch";
import { ColorSwatch } from "@/components/products/clover-color-swatch";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@/lib/list/sort";
import type { CategoryListRow, CategorySortColumn } from "@/lib/services/inventory.service";
import { CategoryEditDialog } from "./category-edit-dialog";

/** Per-row push — same endpoint the bulk "Push categories" button hits, scoped to one publicId. */
function PushCategoryButton({ category }: { category: CategoryListRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        await apiFetch("/api/inventory/sync/clover", {
          method: "POST",
          body: JSON.stringify({ direction: "push_categories", publicIds: [category.publicId] }),
        });
        toast.success(`Pushed "${category.name}" to Clover`);
        router.refresh();
      } catch {
        // apiFetch already toasts
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2"
      aria-label={`Push ${category.name} to Clover`}
      disabled={pending}
      onClick={onClick}
    >
      <RefreshCwIcon className={pending ? "size-3.5 animate-spin" : "size-3.5"} />
    </Button>
  );
}

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
            <TableCell className="flex justify-end gap-1 text-right">
              <PushCategoryButton category={r} />
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
