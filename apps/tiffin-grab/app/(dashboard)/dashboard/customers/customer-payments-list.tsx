"use client";

import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { DataTable, ListPagination, OrderStatusBadge, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/reui-facet-filters";
import { TableCell } from "@foundry/ui/table";
import type { SortState } from "@foundry/design-system/list-sort";
import { formatDateOnly, formatEpoch } from "@/lib/format/datetime";
import type { CustomerRow, CustomerSortColumn } from "@/lib/services/customers.service";

// The Customers page's Payments tab: one row per customer with their money and order facts.
const COLUMNS: readonly Column<CustomerSortColumn>[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "paid", label: "Total paid", sortable: true, align: "right" },
  { key: "free", label: "Free tiffins", sortable: true, align: "right" },
  { key: "cancelled", label: "Cancelled", sortable: true, align: "right" },
  { key: "latestOrder", label: "Latest order", sortable: true },
  { key: "lastDelivered", label: "Last delivered", sortable: true },
];

export function CustomerPaymentsList({
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
  const tz = useTimezone();
  return (
    <div className="space-y-4">
      <DataTable
        serialOffset={pageOffset(page, size)}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        idAccessor={(r) => r.publicId}
        idHref={(r) => `/dashboard/customers/${r.publicId}`}
        rowClassName={() => "group cursor-pointer"}
        filters={<ListSearchFilters spec={spec} placeholder="Search customers…" shortPlaceholder="Search…" dateControl="external" />}
        emptyIcon={UsersIcon}
        emptyMessage="No customers yet."
        emptySearchMessage="No customers match your search."
        renderRow={(c) => (
          <>
            <TableCell className="font-medium">
              <Link href={`/dashboard/customers/${c.publicId}`} className="group-hover:underline">
                {c.name ?? c.email ?? "(no name)"}
              </Link>
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(Number(c.totalPaid))}</TableCell>
            <TableCell className="text-right tabular-nums">{c.freeTiffins || "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{c.cancelledOrders || "—"}</TableCell>
            <TableCell>
              {c.latestOrderAt && c.latestStatus ? (
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className="tabular-nums">{formatEpoch(c.latestOrderAt, { mode: "date", timeZone: tz })}</span>
                  <OrderStatusBadge status={c.latestStatus} />
                </div>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">{c.lastDelivered ? formatDateOnly(c.lastDelivered) : "—"}</TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function CustomerPaymentsListSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
