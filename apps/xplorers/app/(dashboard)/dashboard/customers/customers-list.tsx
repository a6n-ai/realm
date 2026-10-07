"use client";

import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { formatMoney, formatPhone } from "@foundry/commons";
import { DataTable, ListPagination, ListSearchFilters, type Column, type FacetDef } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import type { SortState } from "@/lib/list/sort";
import type { CustomerRow, CustomerSortColumn } from "@/lib/services/customers.service";

export type CustomerListRow = CustomerRow & { joinedLabel: string; lastBookingLabel: string };

const COLUMNS: readonly Column<CustomerSortColumn | "username" | "phone" | "status">[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "username", label: "Username" },
  { key: "email", label: "Email", sortable: true },
  { key: "phone", label: "Phone" },
  { key: "status", label: "Status" },
  { key: "joined", label: "Joined", sortable: true },
  { key: "bookings", label: "Bookings", sortable: true, align: "right" },
  { key: "spent", label: "Spent", sortable: true, align: "right" },
  { key: "lastBooking", label: "Last booking", sortable: true },
];

export function CustomersList({
  spec,
  rows,
  total,
  page,
  size,
  sort,
  currency,
}: {
  spec: FacetDef[];
  rows: CustomerListRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<CustomerSortColumn>;
  currency: string;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        serialOffset={page * size}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        idAccessor={(r) => r.publicId}
        idHref={(r) => `/dashboard/customers/${r.publicId}`}
        rowClassName={() => "group cursor-pointer"}
        filters={<ListSearchFilters spec={spec} placeholder="Search customers…" shortPlaceholder="Search…" />}
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
            <TableCell className="text-muted-foreground">{c.username ? `@${c.username}` : "—"}</TableCell>
            <TableCell>{c.email ?? "—"}</TableCell>
            <TableCell>{c.phone ? formatPhone(c.phone) : "—"}</TableCell>
            <TableCell>
              <Badge variant={c.status === "active" ? "default" : "outline"} className="capitalize">
                {c.status}
              </Badge>
            </TableCell>
            <TableCell className="tabular-nums">{c.joinedLabel}</TableCell>
            <TableCell className="text-right tabular-nums">{c.bookingCount}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(Number(c.totalSpent), currency)}</TableCell>
            <TableCell className="tabular-nums">{c.lastBookingLabel}</TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function CustomersListSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
