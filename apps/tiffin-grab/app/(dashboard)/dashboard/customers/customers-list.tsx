"use client";

import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { DataTable, OrderStatusBadge, type Column } from "@/components/ds";
import { TableCell } from "@realm/ui/table";
import type { SortState } from "@/lib/list/sort";
import type { CustomerSortColumn } from "./page";

type Row = {
  publicId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  orderCount: number;
  latestStatus: string | null;
};

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
  rows,
  sort,
}: {
  rows: Row[];
  sort: SortState<CustomerSortColumn>;
}) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.publicId}
      sort={sort}
      idAccessor={(r) => r.publicId}
      idHref={(r) => `/dashboard/customers/${r.publicId}`}
      search={{ placeholder: "Search by name, email, phone or ID…", shortPlaceholder: "Search…", keys: ["name", "email", "phone"] }}
      rowClassName={() => "group cursor-pointer"}
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
  );
}

// Loading twin is now owned by DataTable — same COLUMNS + lead columns, zero drift.
export function CustomersListSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
