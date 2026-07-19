"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackageSearchIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import type { FileDetail } from "@realm/storage/model";
import type { PendingSync } from "@/db/schema/products";
import { DataTable, FacetFilters, ListPagination, type Column, type FacetDef } from "@realm/design-system";
import { TableCell } from "@realm/ui/table";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { PendingSyncReviewDialog } from "@/components/admin/pending-sync-review-dialog";
import { SyncDialog } from "@/components/admin/sync-dialog";
import { apiFetch } from "@/lib/http/api-fetch";
import { CATEGORIES, type CategoryId } from "@/lib/menu-categories";
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
  source: "manual" | "uber_eats";
  lastSyncedAt: number | null;
  syncStatus: "none" | "synced" | "update_available";
  pendingSync: PendingSync | null;
};

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

type ProductColumn = "name" | "category" | "price" | "status" | "source" | "synced" | "actions";

// Single source of truth for the table's columns — DataTable renders both the
// live header and the loading skeleton from this array (see .Skeleton below).
const COLUMNS: readonly Column<ProductColumn>[] = [
  { key: "name", label: "Name" },
  { key: "category", label: "Category" },
  { key: "price", label: "Price", align: "right" },
  { key: "status", label: "Status" },
  { key: "source", label: "Source" },
  { key: "synced", label: "Last synced" },
  { key: "actions", label: "" },
];

export function ProductsTable({
  spec,
  products,
  total,
  page,
  size,
}: {
  spec: FacetDef[];
  products: ProductRow[];
  total: number;
  page: number;
  size: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<ProductRow | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [reviewing, setReviewing] = useState<ProductRow | null>(null);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(row: ProductRow) {
    setEditing(row);
    setFormOpen(true);
  }

  async function confirmRemove() {
    if (!removing) return;
    await apiFetch(`/api/products/${removing.publicId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="flex wrap-gap between" style={{ alignItems: "center" }}>
        <div />
        <div className="flex" style={{ gap: 8 }}>
          <button className="btn btn--white btn--sm" onClick={() => setSyncOpen(true)}>
            <RefreshCwIcon size={16} /> Sync from Uber Eats
          </button>
          <button className="btn btn--red btn--sm" onClick={openNew}>
            <PlusIcon size={16} /> Add product
          </button>
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={products}
        rowKey={(p) => p.publicId}
        filters={<FacetFilters spec={spec} />}
        emptyIcon={PackageSearchIcon}
        emptyMessage="No products yet."
        emptySearchMessage="No products match your filters."
        renderRow={(row) => (
          <>
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                {row.image?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.image.url}
                    alt={row.name}
                    loading="lazy"
                    style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--muted, #eee)" }} />
                )}
                {row.name}
              </div>
            </TableCell>
            <TableCell>{CATEGORIES[row.category as CategoryId]?.name ?? row.category}</TableCell>
            <TableCell className="text-right tabular-nums">${row.price.toFixed(2)}</TableCell>
            <TableCell>{row.active ? "Active" : "Archived"}</TableCell>
            <TableCell>
              {row.source === "uber_eats" ? (
                row.syncStatus === "update_available" ? (
                  <button
                    className="status-pill status-pill--danger"
                    style={{ cursor: "pointer" }}
                    onClick={() => setReviewing(row)}
                  >
                    Update available
                  </button>
                ) : (
                  "Uber Eats"
                )
              ) : (
                "Manual"
              )}
            </TableCell>
            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
              {relativeTime(row.lastSyncedAt)}
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-1.5">
                <button className="icon-btn" onClick={() => openEdit(row)} aria-label={`Edit ${row.name}`}>
                  <PencilIcon size={15} />
                </button>
                <button
                  className="icon-btn icon-btn--danger"
                  onClick={() => setRemoving(row)}
                  aria-label={`Remove ${row.name}`}
                >
                  <Trash2Icon size={15} />
                </button>
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
      <SyncDialog open={syncOpen} onOpenChange={setSyncOpen} />
      <PendingSyncReviewDialog product={reviewing} onOpenChange={(open) => !open && setReviewing(null)} />
    </div>
  );
}

// Loading twin — same bordered card + column header, zero drift with COLUMNS.
export function ProductsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
