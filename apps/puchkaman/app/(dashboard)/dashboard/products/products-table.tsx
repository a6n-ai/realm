"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackageSearchIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import type { FileDetail } from "@realm/storage/model";
import type { PendingSync } from "@/db/schema/products";
import type { FacetDef } from "@realm/design-system";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { PendingSyncReviewDialog } from "@/components/admin/pending-sync-review-dialog";
import { SyncDialog } from "@/components/admin/sync-dialog";
import { apiFetch } from "@/lib/http/api-fetch";
import { CATEGORIES, type CategoryId } from "@/lib/menu-categories";
import { ProductForm } from "./product-form";
import { ProductFilters } from "./product-filters";
import { ProductPagination } from "./product-pagination";

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
        <ProductFilters spec={spec} />
        <div className="flex" style={{ gap: 8 }}>
          <button className="btn btn--white btn--sm" onClick={() => setSyncOpen(true)}>
            <RefreshCwIcon size={16} /> Sync from Uber Eats
          </button>
          <button className="btn btn--red btn--sm" onClick={openNew}>
            <PlusIcon size={16} /> Add product
          </button>
        </div>
      </div>

      {products.length === 0 ? (
        <div
          className="flex center"
          style={{
            flexDirection: "column",
            gap: 10,
            padding: "48px 16px",
            border: "var(--bd) solid var(--ink)",
            borderRadius: "var(--r-sm)",
            background: "var(--white)",
          }}
        >
          <PackageSearchIcon size={28} style={{ opacity: 0.4 }} />
          <p style={{ fontWeight: 700, opacity: 0.7 }}>
            {total === 0 ? "No products yet." : "No products match your filters."}
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th>Status</th>
                <th>Source</th>
                <th>Last synced</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((row) => (
                <tr key={row.publicId}>
                  <td>
                    <div className="flex center" style={{ gap: 10 }}>
                      {row.image?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.image.url}
                          alt={row.name}
                          loading="lazy"
                          style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            background: "var(--cream)",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span style={{ fontWeight: 700 }}>{row.name}</span>
                    </div>
                  </td>
                  <td>{CATEGORIES[row.category as CategoryId]?.name ?? row.category}</td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    ${row.price.toFixed(2)}
                  </td>
                  <td>{row.active ? "Active" : "Archived"}</td>
                  <td>
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
                  </td>
                  <td className="mono" style={{ fontSize: "0.78rem", whiteSpace: "nowrap", opacity: 0.7 }}>
                    {relativeTime(row.lastSyncedAt)}
                  </td>
                  <td>
                    <div className="flex" style={{ gap: 6, justifyContent: "flex-end" }}>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProductPagination page={page} size={size} total={total} />

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
