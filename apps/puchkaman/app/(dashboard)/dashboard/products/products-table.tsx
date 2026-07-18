"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PackageSearchIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import type { FileDetail } from "@realm/storage/model";
import type { PendingSync } from "@/db/schema/products";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { PendingSyncReviewDialog } from "@/components/admin/pending-sync-review-dialog";
import { SyncDialog } from "@/components/admin/sync-dialog";
import { apiFetch } from "@/lib/http/api-fetch";
import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "@/lib/menu-categories";
import { ProductForm } from "./product-form";

export type ProductRow = {
  id: bigint;
  publicId: string;
  name: string;
  description: string | null;
  // Stored as free text (see db/schema/products.ts); validated against
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

type SortField = "name" | "category" | "price" | "status";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;

export function ProductsTable({ products }: { products: ProductRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<ProductRow | null>(null);
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [reviewing, setReviewing] = useState<ProductRow | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: "name", dir: "asc" });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses search, matching the site's keyboard-first admin feel — skipped
  // while the user is already typing somewhere else (form fields, the dialog).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || formOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [formOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = products;
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    if (category !== "all") rows = rows.filter((r) => r.category === category);

    const dir = sort.dir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      switch (sort.field) {
        case "price":
          return (a.price - b.price) * dir;
        case "category":
          return a.category.localeCompare(b.category) * dir;
        case "status":
          return (Number(a.active) - Number(b.active)) * dir;
        default:
          return a.name.localeCompare(b.name) * dir;
      }
    });
    return rows;
  }, [products, search, category, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Filters/search/sort changing the result set can strand `page` past the
  // new last page (or leave stale selections pointing at rows no longer shown).
  useEffect(() => setPage(1), [search, category, sort]);
  useEffect(() => setSelected(new Set()), [search, category]);

  function toggleSort(field: SortField) {
    setSort((s) => (s.field === field ? { field, dir: s.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" }));
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    const pageIds = pageRows.map((r) => r.publicId);
    const allSelected = pageIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      pageIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }

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

  async function confirmBulkRemove() {
    await Promise.all(Array.from(selected).map((id) => apiFetch(`/api/products/${id}`, { method: "DELETE" })));
    setSelected(new Set());
    router.refresh();
  }

  const activeCategories = CATEGORY_IDS.filter((id) => products.some((p) => p.category === id));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* toolbar */}
      <div className="flex wrap-gap between" style={{ alignItems: "center" }}>
        <div className="flex wrap-gap" style={{ flex: 1, minWidth: 240 }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 340 }}>
            <SearchIcon size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }} />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search products…  (press /)"
              className="input"
              style={{ paddingLeft: 36 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="select" style={{ width: "auto", minWidth: 160 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {activeCategories.map((id) => (
              <option key={id} value={id}>
                {CATEGORIES[id].emoji} {CATEGORIES[id].name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <button className="btn btn--white btn--sm" onClick={() => setSyncOpen(true)}>
            <RefreshCwIcon size={16} /> Sync from Uber Eats
          </button>
          <button className="btn btn--red btn--sm" onClick={openNew}>
            <PlusIcon size={16} /> Add product
          </button>
        </div>
      </div>

      {/* bulk action bar */}
      {selected.size > 0 && (
        <div
          className="flex center between"
          style={{ padding: "10px 16px", background: "var(--ink)", color: "var(--cream)", borderRadius: "var(--r-sm)", border: "var(--bd) solid var(--ink)" }}
        >
          <span className="mono" style={{ fontSize: "0.82rem", fontWeight: 700 }}>
            {selected.size} selected
          </span>
          <div className="flex" style={{ gap: 8 }}>
            <button className="btn btn--white btn--sm" onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <button className="btn btn--red btn--sm" onClick={() => setBulkRemoveOpen(true)}>
              <Trash2Icon size={14} /> Remove selected
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={PackageSearchIcon}
          title={products.length === 0 ? "No products yet" : "No matching products"}
          description={
            products.length === 0
              ? "Add your first product to start building the public menu."
              : "Try a different search term or category filter."
          }
          action={
            products.length === 0 ? (
              <button className="btn btn--red btn--sm" onClick={openNew}>
                <PlusIcon size={16} /> Add product
              </button>
            ) : undefined
          }
        />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={pageRows.length > 0 && pageRows.every((r) => selected.has(r.publicId))}
                    onChange={toggleSelectAllOnPage}
                  />
                </th>
                <th style={{ width: 56 }}>Image</th>
                <SortableHeader field="name" label="Name" sort={sort} onSort={toggleSort} />
                <SortableHeader field="category" label="Category" sort={sort} onSort={toggleSort} />
                <SortableHeader field="price" label="Price" sort={sort} onSort={toggleSort} align="right" />
                <SortableHeader field="status" label="Status" sort={sort} onSort={toggleSort} />
                <th>Source</th>
                <th>Last synced</th>
                <th style={{ width: 116, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.publicId} className={selected.has(row.publicId) ? "admin-row-checked" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.name}`}
                      checked={selected.has(row.publicId)}
                      onChange={() => toggleSelected(row.publicId)}
                    />
                  </td>
                  <td>
                    {row.image?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.image.url}
                        alt={row.name}
                        loading="lazy"
                        style={{ width: 40, height: 40, borderRadius: 8, border: "2px solid var(--ink)", objectFit: "cover" }}
                      />
                    ) : (
                      <div className="ph" style={{ width: 40, height: 40, borderRadius: 8, minHeight: 0 }} />
                    )}
                  </td>
                  <td style={{ fontWeight: 700 }}>{row.name}</td>
                  <td>
                    <span className="pill pill--yellow" style={{ fontWeight: 700 }}>
                      {CATEGORIES[row.category as CategoryId]?.name ?? row.category}
                    </span>
                  </td>
                  <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>
                    ${row.price.toFixed(2)}
                  </td>
                  <td>
                    <span className={`status-pill ${row.active ? "status-pill--success" : "status-pill--danger"}`}>
                      <span className="status-pill--dot" />
                      {row.active ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td>
                    {row.source === "uber_eats" ? (
                      row.syncStatus === "update_available" ? (
                        <button
                          className="status-pill status-pill--danger"
                          style={{ cursor: "pointer", background: "var(--yellow-deep)", color: "var(--ink-deep)" }}
                          onClick={() => setReviewing(row)}
                        >
                          Update available
                        </button>
                      ) : (
                        <span className="pill" style={{ background: "var(--mint)", color: "#fff" }}>
                          Uber Eats
                        </span>
                      )
                    ) : (
                      <span className="pill">Manual</span>
                    )}
                  </td>
                  <td className="mono" style={{ fontSize: "0.78rem", opacity: 0.65, whiteSpace: "nowrap" }}>
                    {relativeTime(row.lastSyncedAt)}
                  </td>
                  <td>
                    <div className="flex" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <button className="icon-btn" onClick={() => openEdit(row)} aria-label={`Edit ${row.name}`}>
                        <PencilIcon size={15} />
                      </button>
                      <button className="icon-btn icon-btn--danger" onClick={() => setRemoving(row)} aria-label={`Remove ${row.name}`}>
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

      {filtered.length > 0 && pageCount > 1 && (
        <div className="flex center between wrap-gap">
          <span className="mono" style={{ fontSize: "0.78rem", opacity: 0.6 }}>
            Page {page} of {pageCount} · {filtered.length} products
          </span>
          <div className="flex" style={{ gap: 8 }}>
            <button className="icon-btn" disabled={page === 1} style={page === 1 ? { opacity: 0.4 } : undefined} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeftIcon size={16} />
            </button>
            <button
              className="icon-btn"
              disabled={page === pageCount}
              style={page === pageCount ? { opacity: 0.4 } : undefined}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
            >
              <ChevronRightIcon size={16} />
            </button>
          </div>
        </div>
      )}

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
      <ConfirmDialog
        open={bulkRemoveOpen}
        onOpenChange={setBulkRemoveOpen}
        title={`Remove ${selected.size} product${selected.size === 1 ? "" : "s"}?`}
        description="They'll be hidden from the public menu. You can bring each one back later from its edit form."
        confirmLabel="Remove"
        danger
        onConfirm={confirmBulkRemove}
      />
      <SyncDialog open={syncOpen} onOpenChange={setSyncOpen} />
      <PendingSyncReviewDialog product={reviewing} onOpenChange={(open) => !open && setReviewing(null)} />
    </div>
  );
}

function SortableHeader({
  field,
  label,
  sort,
  onSort,
  align,
}: {
  field: SortField;
  label: string;
  sort: { field: SortField; dir: SortDir };
  onSort: (field: SortField) => void;
  align?: "right";
}) {
  const active = sort.field === field;
  return (
    <th onClick={() => onSort(field)} style={align ? { textAlign: "right" } : undefined}>
      <span className="flex center" style={{ gap: 4, justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
        {label}
        {active && (sort.dir === "asc" ? <ArrowUpIcon size={12} /> : <ArrowDownIcon size={12} />)}
      </span>
    </th>
  );
}
