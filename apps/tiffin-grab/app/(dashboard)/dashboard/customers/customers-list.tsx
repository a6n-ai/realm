"use client";

import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { DataTable, ListPagination, OrderStatusBadge, type Column, type FacetDef } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { TableCell } from "@realm/ui/table";
import type { SortState } from "@/lib/list/sort";
import type { CustomerRow, CustomerSortColumn } from "@/lib/services/customers.service";

// Single source of truth for the table's columns. DataTable renders the header
// and DataTable.Skeleton renders the loading twin from this same array, so the
// two can never drift. (The leading "#" and ID columns are added by DataTable.)
const COLUMNS: readonly Column<CustomerSortColumn | "latestStatus">[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "email", label: "Email", sortable: true },
  { key: "phone", label: "Phone", sortable: true },
  { key: "orders", label: "Orders", sortable: true, align: "right" },
  { key: "latestStatus", label: "Latest status" },
];

export function CustomersList({
  spec,
  rows,
  total,
  page,
  size,
  sort,
}: {
  spec: FacetDef[];
  rows: CustomerRow[];
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
        sort={sort}
        idAccessor={(r) => r.publicId}
        idHref={(r) => `/dashboard/customers/${r.publicId}`}
        rowClassName={() => "group cursor-pointer"}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={UsersIcon}
        emptyMessage="No customers yet."
        emptySearchMessage="No customers match your search."
        renderRow={(c) => (
          <>
            <TableCell className="font-medium">
              <Link href={`/dashboard/customers/${c.publicId}`} className="group-hover:underline">
                {c.name ?? "(no name)"}
              </Link>
            </TableCell>
            <TableCell>{c.email ?? "(no email)"}</TableCell>
            <TableCell>{c.phone ?? "no phone"}</TableCell>
            <TableCell className="text-right tabular-nums">{c.orderCount}</TableCell>
            <TableCell>
              {c.latestStatus ? <OrderStatusBadge status={c.latestStatus} /> : "—"}
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

// Loading twin is now owned by DataTable — same COLUMNS + lead columns, zero drift.
export function CustomersListSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
