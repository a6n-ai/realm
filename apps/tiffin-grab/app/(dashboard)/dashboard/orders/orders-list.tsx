"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronRightIcon, PackageIcon } from "lucide-react";
import { formatMoney as fmt } from "@realm/commons";
import { DataTable, FilterPill, FilterSheet, OrderStatusBadge, type Column } from "@/components/ds";
import { TableCell } from "@realm/ui/table";
import { formatEpoch } from "@/lib/format/datetime";
import { useUrlState } from "@/lib/list/use-url-state";
import type { OrderListRow, OrderSortColumn } from "@/lib/services/orders.service";
import type { SortState } from "@/lib/list/sort";

const STATUS_PILLS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "waitlisted", label: "Waitlisted" },
  { key: "paused", label: "Paused" },
  { key: "cancelled", label: "Cancelled" },
] as const;

// Single source of truth for the table's columns. DataTable renders the header
// and DataTable.Skeleton renders the loading twin from this same array, so the
// two can never drift.
const COLUMNS: readonly Column<OrderSortColumn | "city" | "chevron">[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "deployment", label: "Deployment", sortable: true },
  { key: "city", label: "City" },
  { key: "status", label: "Status", sortable: true },
  { key: "start", label: "Start", sortable: true, align: "right" },
  { key: "total", label: "Total", sortable: true, align: "right" },
  { key: "created", label: "Created", sortable: true, align: "right" },
  { key: "chevron", label: "", width: "w-8" },
];

export function OrdersList({
  rows,
  sort,
}: {
  rows: OrderListRow[];
  sort: SortState<OrderSortColumn>;
}) {
  // Status is a client-side FilterPill filter (URL "status"). DataTable owns the
  // "q" search param; we pre-filter by status here and let DataTable search the
  // result set.
  const [status, setStatus] = useUrlState("status", "all");

  // One pass over rows for all pill counts; search-independent so it only
  // recomputes when rows change, not on every keystroke.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);
  const countOf = (s: string) => (s === "all" ? rows.length : counts[s] ?? 0);

  const statusRows = useMemo(
    () => (status === "all" ? rows : rows.filter((r) => r.status === status)),
    [rows, status],
  );

  return (
    <DataTable
      columns={COLUMNS}
      rows={statusRows}
      rowKey={(o) => o.publicId}
      sort={sort}
      idAccessor={(o) => o.publicId}
      idHref={(o) => `/dashboard/orders/${o.publicId}`}
      search={{ placeholder: "Search by name, city or ID…", shortPlaceholder: "Search…", keys: ["fullName", "deploymentId", "city"] }}
      rowClassName={() => "group cursor-pointer"}
      filters={
        <>
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            {STATUS_PILLS.map((p) => (
              <FilterPill
                key={p.key}
                label={p.label}
                active={status === p.key}
                count={countOf(p.key)}
                onClick={() => setStatus(p.key)}
              />
            ))}
          </div>
          <div className="md:hidden">
            <FilterSheet iconOnly activeCount={status === "all" ? 0 : 1}>
              <div className="flex flex-wrap gap-2">
                {STATUS_PILLS.map((p) => (
                  <FilterPill
                    key={p.key}
                    label={p.label}
                    active={status === p.key}
                    count={countOf(p.key)}
                    onClick={() => setStatus(p.key)}
                  />
                ))}
              </div>
            </FilterSheet>
          </div>
        </>
      }
      emptyIcon={PackageIcon}
      emptyMessage="No orders yet."
      emptySearchMessage="No orders match your search."
      renderRow={(o) => (
        <>
          <TableCell className="font-medium">
            <Link href={`/dashboard/orders/${o.publicId}`} className="group-hover:underline">
              {o.fullName}
            </Link>
          </TableCell>
          <TableCell>{o.deploymentId}</TableCell>
          <TableCell>{o.city}</TableCell>
          <TableCell>
            <OrderStatusBadge status={o.status} />
          </TableCell>
          <TableCell className="text-right tabular-nums">{o.startDate}</TableCell>
          <TableCell className="text-right tabular-nums">{fmt(Number(o.total))}</TableCell>
          <TableCell className="text-right tabular-nums">
            {formatEpoch(o.createdAt, { mode: "date" })}
          </TableCell>
          <TableCell>
            <ChevronRightIcon className="size-4 opacity-0 transition-opacity group-hover:opacity-60" />
          </TableCell>
        </>
      )}
    />
  );
}

// Loading twin is now owned by DataTable — same COLUMNS + lead columns, zero drift.
export function OrdersListSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
