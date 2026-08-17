"use client";

import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { DataTable, ListPagination, type Column, type FacetDef } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { TableCell } from "@realm/ui/table";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@/lib/list/sort";
import type { CustomerRow, CustomerSortColumn } from "@/lib/services/customers.service";

// Dates arrive pre-formatted from the server component — see the note there.
type Row = CustomerRow & { spentLabel: string; joinedLabel: string; lastOrderLabel: string };

const COLUMNS: readonly Column<CustomerSortColumn>[] = [
  { key: "name", label: "Customer", sortable: true },
  { key: "email", label: "Contact", sortable: true },
  { key: "orders", label: "Orders", sortable: true, align: "right" },
  { key: "spent", label: "Spent", sortable: true, align: "right" },
  { key: "lastOrder", label: "Last order", sortable: true, align: "right" },
  { key: "joined", label: "Joined", sortable: true, align: "right" },
];

export function CustomersTable({
  spec,
  rows,
  total,
  page,
  size,
  sort,
}: {
  spec: FacetDef[];
  rows: Row[];
  total: number;
  page: number;
  size: number;
  sort: SortState<CustomerSortColumn>;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        serial={false}
        sort={sort}
        idHref={(r) => `/dashboard/customers/${r.publicId}`}
        search={{
          placeholder: "Search name, email or phone…",
          shortPlaceholder: "Search…",
          debounceMs: 250,
        }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={UsersIcon}
        emptyMessage="No customers yet."
        emptySearchMessage="No customers match your filters."
        renderRow={(r) => (
          <>
            <TableCell>
              <Link
                href={`/dashboard/customers/${r.publicId}`}
                className="font-medium hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {r.name ?? "—"}
              </Link>
              {r.status !== "active" ? (
                <Badge variant="destructive" className="ml-2">
                  {r.status}
                </Badge>
              ) : null}
            </TableCell>
            <TableCell>
              <div className="text-xs">{r.email ?? "—"}</div>
              <div className="text-muted-foreground text-xs">{r.phone ?? "—"}</div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.orderCount}</TableCell>
            <TableCell className="text-right tabular-nums">{r.spentLabel}</TableCell>
            <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
              {r.lastOrderLabel}
            </TableCell>
            <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
              {r.joinedLabel}
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function CustomersTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} serial={false} />;
}
