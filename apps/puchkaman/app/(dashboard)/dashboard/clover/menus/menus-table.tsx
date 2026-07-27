"use client";

import Link from "next/link";
import { BookOpenIcon } from "lucide-react";
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
import type { MenuListRow, MenuSortColumn } from "@/lib/services/inventory.service";

// Sortable keys must match MenuSortColumn. "sections" is display-only.
type MenuCol = MenuSortColumn | "sections";

const COLUMNS: readonly Column<MenuCol>[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "sections", label: "Sections", sortable: false },
  { key: "status", label: "Status", sortable: true },
  { key: "order", label: "Order", sortable: true },
  { key: "synced", label: "Last synced", sortable: true, align: "right" },
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

export function MenusTable({
  spec,
  rows,
  total,
  page,
  size,
  sort,
}: {
  spec: FacetDef[];
  rows: MenuListRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<MenuSortColumn>;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        serial={false}
        sort={sort}
        idHref={(r) => `/dashboard/clover/menus/${r.publicId}`}
        search={{
          placeholder: "Search menus…",
          shortPlaceholder: "Search…",
          debounceMs: 250,
        }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={BookOpenIcon}
        emptyMessage="No menus yet. Sync from Clover builds a Register menu from categories."
        emptySearchMessage="No menus match your filters."
        renderRow={(r) => (
          <>
            <TableCell>
              <Link
                href={`/dashboard/clover/menus/${r.publicId}`}
                className="font-medium hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {r.name}
              </Link>
            </TableCell>
            <TableCell>
              {r.sectionCount} section{r.sectionCount === 1 ? "" : "s"}
            </TableCell>
            <TableCell>
              <Badge variant={r.active ? "default" : "outline"}>
                {r.active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell>{r.sortOrder}</TableCell>
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

// FilterBar twin + table twin — mirrors live search + ReuiFacetFilters chrome.
export function MenusTableSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonFilterBar dropdown />
      <DataTable.Skeleton columns={COLUMNS} serial={false} />
    </div>
  );
}
