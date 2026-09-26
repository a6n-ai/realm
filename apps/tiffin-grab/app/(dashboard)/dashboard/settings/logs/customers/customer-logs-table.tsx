"use client";

import Link from "next/link";
import { UserRoundSearchIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { DataTable, ListPagination, type Column } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { useTimezone } from "@/components/providers/timezone-provider";
import {
  CUSTOMER_ACTIVITY_CATEGORY_LABELS,
  CUSTOMER_ACTIVITY_FACETS,
} from "@/lib/customer-activity/log-facets";
import { formatEpoch } from "@/lib/format/datetime";
import type { SortState } from "@/lib/list/sort";
import type {
  CustomerActivityListRow,
  CustomerActivitySortColumn,
} from "@/lib/services/customer-activities-list.service";

const COLUMNS: readonly Column<CustomerActivitySortColumn | "customer" | "activity" | "details">[] =
  [
    { key: "time", label: "When", sortable: true },
    { key: "customer", label: "Customer" },
    { key: "activity", label: "Activity" },
    { key: "details", label: "Details" },
  ];

export function CustomerLogsTable({
  rows,
  total,
  page,
  size,
  sort,
}: {
  rows: CustomerActivityListRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<CustomerActivitySortColumn>;
}) {
  const timezone = useTimezone();
  const formatTime = (value: number) =>
    formatEpoch(value, { mode: "datetime", timeZone: timezone });

  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.publicId}
        serial={false}
        sort={sort as SortState<(typeof COLUMNS)[number]["key"]>}
        search={{
          placeholder: "Search customer, email, order, or details…",
          shortPlaceholder: "Search customer…",
          debounceMs: 250,
        }}
        filters={<ReuiFacetFilters spec={CUSTOMER_ACTIVITY_FACETS} />}
        emptyIcon={UserRoundSearchIcon}
        emptyMessage="No saved customer activity yet."
        emptySearchMessage="No customer activity matches your filters."
        renderRow={(row) => (
          <>
            <TableCell className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">
              {formatTime(row.createdAt)}
            </TableCell>
            <TableCell>
              <Link
                href={`/dashboard/customers/${row.customerPublicId}`}
                className="font-medium hover:underline"
              >
                {row.customerName}
              </Link>
              <div className="text-muted-foreground text-xs">{row.customerEmail}</div>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{row.action}</span>
                <Badge variant="outline" className="text-[10px]">
                  {CUSTOMER_ACTIVITY_CATEGORY_LABELS[row.category]}
                </Badge>
              </div>
              <Link
                href={row.href}
                className="text-muted-foreground text-xs hover:text-foreground hover:underline"
              >
                {row.contextLabel}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground max-w-[300px] truncate text-xs">
              {row.details ?? "—"}
            </TableCell>
          </>
        )}
        mobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{row.action}</p>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {formatTime(row.createdAt)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href={`/dashboard/customers/${row.customerPublicId}`}
                className="text-sm hover:underline"
              >
                {row.customerName}
              </Link>
              <Badge variant="outline" className="text-[10px]">
                {CUSTOMER_ACTIVITY_CATEGORY_LABELS[row.category]}
              </Badge>
            </div>
            {row.details ? (
              <p className="text-muted-foreground text-xs">{row.details}</p>
            ) : null}
            <Link
              href={row.href}
              className="text-muted-foreground text-xs hover:text-foreground hover:underline"
            >
              {row.contextLabel}
            </Link>
          </div>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function CustomerLogsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} serial={false} />;
}
