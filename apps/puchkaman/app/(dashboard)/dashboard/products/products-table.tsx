"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PackageSearchIcon,
  PencilIcon,
  PlusIcon,
  LinkIcon,
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
import { CloverLinkDialog } from "@/components/admin/clover-link-dialog";
import { PendingSyncReviewDialog } from "@/components/admin/pending-sync-review-dialog";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { CloverColorSwatch } from "@/components/products/clover-color-swatch";
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
  cloverItemId: string | null;
  cloverLastSyncedAt: number | null;
  cloverColorCode: string | null;
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
  cloverEnabled = false,
}: {
  spec: FacetDef[];
  products: ProductRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<ProductSortColumn>;
  /** Plugin installed — gates Link/Unlink Clover actions. */
  cloverEnabled?: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<ProductRow | null>(null);
  const [reviewing, setReviewing] = useState<ProductRow | null>(null);
  const [cloverLinking, setCloverLinking] = useState<ProductRow | null>(null);

  async function confirmRemove() {
    if (!removing) return;
    await apiFetch(`/api/products/${removing.publicId}`, { method: "DELETE" });
    router.refresh();
  }

  const emptyAction: ReactNode =
    total === 0 ? (
      <Button type="button" size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
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
        idHref={(r) => `/dashboard/products/${r.publicId}`}
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
                <div className="flex min-w-0 items-center gap-1.5">
                  <CloverColorSwatch color={row.cloverColorCode} size={12} />
                  <Link
                    href={`/dashboard/products/${row.publicId}`}
                    className="hover:text-foreground truncate font-medium hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {row.name}
                  </Link>
                </div>
              </div>
            </TableCell>
            <TableCell>{CATEGORIES[row.category as CategoryId]?.name ?? row.category}</TableCell>
            <TableCell className="text-right font-mono text-sm tabular-nums">
              ${row.price.toFixed(2)}
            </TableCell>
            <TableCell>
              <Badge variant={row.active ? "secondary" : "outline"}>
                {row.active
                  ? "Active"
                  : row.cloverItemId || row.source === "uber_eats"
                    ? "Out of stock"
                    : "Archived"}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                {row.source === "uber_eats" ? (
                  row.syncStatus === "update_available" ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReviewing(row);
                      }}
                    >
                      Update available
                    </Button>
                  ) : (
                    <span>Uber Eats</span>
                  )
                ) : (
                  <span>Manual</span>
                )}
                {cloverEnabled && row.cloverItemId ? (
                  <Badge variant="outline" className="w-fit text-[10px]">
                    Clover
                  </Badge>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground text-right font-mono text-xs tabular-nums">
              {relativeTime(
                cloverEnabled ? (row.cloverLastSyncedAt ?? row.lastSyncedAt) : row.lastSyncedAt,
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                {cloverEnabled ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCloverLinking(row);
                    }}
                    aria-label={
                      row.cloverItemId
                        ? `Unlink ${row.name} from Clover`
                        : `Link ${row.name} to Clover`
                    }
                  >
                    <LinkIcon className="size-3.5" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/dashboard/products/${row.publicId}`);
                  }}
                  aria-label={`Open ${row.name}`}
                >
                  <PencilIcon className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive size-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRemoving(row);
                  }}
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

      <ProductForm open={formOpen} onOpenChange={setFormOpen} product={null} />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this product?"
        description={`"${removing?.name}" will be hidden from the public menu. You can bring it back later from the product page.`}
        confirmLabel="Remove"
        danger
        onConfirm={confirmRemove}
      />
      <PendingSyncReviewDialog
        product={reviewing}
        onOpenChange={(open) => !open && setReviewing(null)}
      />
      {cloverEnabled ? (
        <CloverLinkDialog
          open={!!cloverLinking}
          onOpenChange={(open) => !open && setCloverLinking(null)}
          product={
            cloverLinking
              ? {
                  publicId: cloverLinking.publicId,
                  name: cloverLinking.name,
                  cloverItemId: cloverLinking.cloverItemId,
                }
              : null
          }
        />
      ) : null}
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
