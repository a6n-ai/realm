"use client";

import Link from "next/link";
import { PackageIcon } from "lucide-react";
import { formatMoney as fmt } from "@realm/commons";
import { DataTable, ListPagination, OrderStatusBadge, type Column, type FacetDef } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { TableCell } from "@realm/ui/table";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { OrderListRow, OrderSortColumn } from "@/lib/services/orders.service";
import type { SortState } from "@/lib/list/sort";
import { ReassignControl } from "@/components/reassign/reassign-control";
import { reassignOrderAction } from "./actions";

// ORDER_STATUS_PILLS lives in ./status-pills (a non-client module) because the
// server page maps over it; re-exporting it here would hand the RSC graph a
// client reference instead of the array.

// Single source of truth for the table's columns. DataTable renders the header
// and DataTable.Skeleton renders the loading twin from this same array, so the
// two can never drift. "deployment" isn't a server sort key (see
// OrderSortColumn), so it's a plain non-sortable column here.
const COLUMNS: readonly Column<OrderSortColumn | "deployment" | "city" | "owner">[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "deployment", label: "Deployment", sortable: false },
  { key: "city", label: "City" },
  { key: "status", label: "Status", sortable: true },
  { key: "owner", label: "Owner", sortable: false },
  { key: "start", label: "Start", sortable: true, align: "right" },
  { key: "total", label: "Total", sortable: true, align: "right" },
  { key: "created", label: "Created", sortable: true, align: "right" },
];

export function OrdersList({
  spec,
  rows,
  total,
  page,
  size,
  sort,
  canReassign,
  staff,
}: {
  spec: FacetDef[];
  rows: OrderListRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<OrderSortColumn>;
  canReassign: boolean;
  staff: { publicId: string; name: string }[];
}) {
  const tz = useTimezone();
  return (
    <div className="space-y-4">
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(o) => o.publicId}
      sort={sort}
      idAccessor={(o) => o.publicId}
      idHref={(o) => `/dashboard/orders/${o.publicId}`}
      rowClassName={() => "group cursor-pointer"}
      filters={<ReuiFacetFilters spec={spec} />}
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
          <TableCell>
            {canReassign ? (
              <ReassignControl
                currentOwnerId={o.ownerId}
                currentOwnerName={o.ownerName}
                staff={staff}
                action={reassignOrderAction.bind(null, o.publicId)}
              />
            ) : (
              (o.ownerName ?? "—")
            )}
          </TableCell>
          <TableCell className="text-right tabular-nums">{o.startDate}</TableCell>
          <TableCell className="text-right tabular-nums">{fmt(Number(o.total))}</TableCell>
          <TableCell className="text-right tabular-nums">
            {formatEpoch(o.createdAt, { mode: "date", timeZone: tz })}
          </TableCell>
        </>
      )}
    />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

// Loading twin is now owned by DataTable — same COLUMNS + lead columns, zero drift.
export function OrdersListSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
