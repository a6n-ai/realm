"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  PackageSearchIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import type { FileDetail } from "@realm/storage/model";
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
import type { PendingSync } from "@/db/schema/products";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { PendingSyncReviewDialog } from "@/components/admin/pending-sync-review-dialog";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { apiFetch } from "@/lib/http/api-fetch";
import type { SortState } from "@/lib/list/sort";
import { CATEGORIES, type CategoryId } from "@/lib/menu-categories";
import type { ProductSortColumn } from "@/lib/services/products.service";
import { ProductForm } from "./product-form";

export type ProductRow = {
  id: bigint;
  publicId: string;
  name: string;
  description: string | null;
  // Stored as free text (see db/schema/products.ts), validated against
  // CATEGORY_IDS at the zod layer on write, not narrowed at the DB/type level.
  category: string;
  price: number;
  image: FileDetail | null;
  tags: string[] | null;
  active: boolean;
  featured: boolean;
  source: "manual" | "uber_eats";
  lastSyncedAt: number | null;
  syncStatus: "none" | "synced" | "update_available";
  pendingSync: PendingSync | null;
};

// Sortable keys must match ProductSortColumn / PRODUCT_SORT_COL. "actions" is
// UI-only and never a server sort key.
type ProductCol = ProductSortColumn | "actions";

const COLUMNS: readonly Column<ProductCol>[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "category", label: "Category", sortable: true },
  { key: "price", label: "Price", sortable: true, align: "right" },
  { key: "status", label: "Status", sortable: true },
  { key: "source", label: "Source", sortable: true },
  { key: "lastSynced", label: "Last synced", sortable: true, align: "right" },
  { key: "actions", label: "", align: "right", width: "w-24" },
];

function relativeTime(ms: number | null): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ProductsTable({
  spec,
  products,
  total,
  page,
  size,
  sort,
}: {
  spec: FacetDef[];
  products: ProductRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<ProductSortColumn>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<ProductRow | null>(null);
  const [reviewing, setReviewing] = useState<ProductRow | null>(null);

  function openEdit(row: ProductRow) {
    setEditing(row);
    setFormOpen(true);
  }

  async function confirmRemove() {
    if (!removing) return;
    await apiFetch(`/api/products/${removing.publicId}`, { method: "DELETE" });
    router.refresh();
  }

  const emptyAction: ReactNode =
    total === 0 ? (
      <Button type="button" size="sm" className="gap-1.5" onClick={() => {
        setEditing(null);
        setFormOpen(true);
      }}>
        <PlusIcon className="size-3.5" />
        Add product
      </Button>
    ) : undefined;

  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={products}
        rowKey={(r) => r.publicId}
        serial={false}
        sort={sort}
        search={{
          placeholder: "Search name or slug…",
          shortPlaceholder: "Search…",
          debounceMs: 250,
        }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={PackageSearchIcon}
        emptyMessage="No products yet."
        emptySearchMessage="No products match your filters."
        emptyAction={emptyAction}
        renderRow={(row) => (
          <>
            <TableCell>
              <div className="flex items-center gap-2.5">
                {row.image?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.image.url}
                    alt=""
                    loading="lazy"
                    className="size-8 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="bg-muted size-8 shrink-0 rounded-md" />
                )}
                <span className="font-medium">{row.name}</span>
              </div>
            </TableCell>
            <TableCell>{CATEGORIES[row.category as CategoryId]?.name ?? row.category}</TableCell>
            <TableCell className="text-right font-mono text-sm tabular-nums">
              ${row.price.toFixed(2)}
            </TableCell>
            <TableCell>
              <Badge variant={row.active ? "secondary" : "outline"}>
                {row.active ? "Active" : "Archived"}
              </Badge>
            </TableCell>
            <TableCell>
              {row.source === "uber_eats" ? (
                row.syncStatus === "update_available" ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setReviewing(row)}
                  >
                    Update available
                  </Button>
                ) : (
                  "Uber Eats"
                )
              ) : (
                "Manual"
              )}
            </TableCell>
            <TableCell className="text-muted-foreground text-right font-mono text-xs tabular-nums">
              {relativeTime(row.lastSyncedAt)}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => openEdit(row)}
                  aria-label={`Edit ${row.name}`}
                >
                  <PencilIcon className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive size-8"
                  onClick={() => setRemoving(row)}
                  aria-label={`Remove ${row.name}`}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />

      <ProductForm open={formOpen} onOpenChange={setFormOpen} product={editing} />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this product?"
        description={`"${removing?.name}" will be hidden from the public menu. You can bring it back later from the edit form.`}
        confirmLabel="Remove"
        danger
        onConfirm={confirmRemove}
      />
      <PendingSyncReviewDialog
        product={reviewing}
        onOpenChange={(open) => !open && setReviewing(null)}
      />
    </div>
  );
}

// FilterBar twin + table twin — mirrors live search + ReuiFacetFilters chrome.
export function ProductsTableSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonFilterBar dropdown />
      <DataTable.Skeleton columns={COLUMNS} serial={false} />
    </div>
  );
}
