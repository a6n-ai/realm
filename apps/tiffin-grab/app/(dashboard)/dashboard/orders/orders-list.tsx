"use client";

import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import Link from "next/link";
import { TableRowsSkeleton } from "@/components/dashboard/table-rows-skeleton";
import { PackageIcon } from "lucide-react";
import { formatMoney as fmt } from "@foundry/commons";
import { DataTable, ListPagination, OrderStatusBadge, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/reui-facet-filters";
import { TableCell } from "@foundry/ui/table";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import type { OrderListRow, OrderSortColumn } from "@/lib/orders/orders.service";
import { orderDisplayStatus } from "@/lib/orders/display-status";
import type { SortState } from "@foundry/design-system/list-sort";
import { RowTag } from "./row-tags";


// ORDER_STATUS_PILLS lives in ./status-pills (a non-client module) because the
// server page maps over it; re-exporting it here would hand the RSC graph a
// client reference instead of the array.

type ListColumn = OrderSortColumn | "owner" | "cost";

// Single source of truth for the table's columns. DataTable renders the header
// and DataTable.Skeleton renders the loading twin from this same array, so the
// two can never drift. "deployment" isn't a server sort key (see
// OrderSortColumn), so it's a plain non-sortable column here.
// Deployment and city sit under the name, so the table fits without sideways scroll.
const COLUMNS: readonly Column<ListColumn>[] = [
    { key: "name", label: "Name", sortable: true, width: "w-72" },
    { key: "status", label: "Status", sortable: true, width: "w-32" },
    { key: "owner", label: "Owner", sortable: false, width: "w-32" },
    { key: "start", label: "Start", sortable: true, align: "right", width: "w-28" },
    { key: "total", label: "Total", sortable: true, align: "right", width: "w-24" },
    { key: "created", label: "Created", sortable: true, align: "right", width: "w-28" },
];
const COST_COLUMN: Column<ListColumn> = { key: "cost", label: "Our cost", align: "right", width: "w-24" };
const withCost = (cols: readonly Column<ListColumn>[]) => [...cols.slice(0, 5), COST_COLUMN, ...cols.slice(5)];

export function OrdersList({
  spec,
  rows,
  total,
  page,
  size,
  sort,
  lookOutView = false,
  paymentReviewView = false,
  freeTiffinsView = false,
  costs = null,
}: {
  spec: FacetDef[];
  rows: OrderListRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<OrderSortColumn>;
  /** The Look out for tab: each row shows why it was flagged. */
  lookOutView?: boolean;
  paymentReviewView?: boolean;
  /** The Free tiffins tab: orders where staff gave tiffins on top of the plan. */
  freeTiffinsView?: boolean;
  /** Plan cost per order publicId; null = viewer may not see costs (column hidden). */
  costs?: Record<string, number | null> | null;
}) {
  const tz = useTimezone();
  return (
    <div className="space-y-4">
    <DataTable
      serialOffset={pageOffset(page, size)}
      columns={costs ? withCost(COLUMNS) : COLUMNS}
      rows={rows}
      rowKey={(o) => o.publicId}
      sort={sort}
      // No idAccessor: the short deployment ID sits under the name instead; idHref keeps rows clickable.
      idHref={(o) => `/dashboard/orders/${o.publicId}`}
      rowClassName={() => "group cursor-pointer"}
      filters={<ListSearchFilters spec={spec} placeholder="Search orders…" shortPlaceholder="Search…" dateControl="external" />}
      emptyIcon={PackageIcon}
      emptyMessage={lookOutView ? "No orders are marked look out for." : paymentReviewView ? "No payments are waiting for review." : freeTiffinsView ? "No order has free tiffins." : "No orders yet."}
      emptySearchMessage="No orders match your search."
      renderRow={(o) => (
        <>
          <TableCell className="font-medium">
            <Link href={`/dashboard/orders/${o.publicId}`} className="group-hover:underline">
              {o.fullName}
            </Link>
            {o.trial && <RowTag tag="trial" />}
            {o.lookOut && !lookOutView && <RowTag tag="lookOut" title={o.lookOutNote ? `Look out for: ${o.lookOutNote}` : undefined} />}
            {o.freeTiffins > 0 && <RowTag tag="free" count={o.freeTiffins} title={`${o.freeTiffins} free ${o.freeTiffins === 1 ? "tiffin" : "tiffins"} given`} />}
            <p className="text-muted-foreground truncate text-xs font-normal">
              {o.deploymentId}
              {o.city ? ` · ${o.city}` : ""}
            </p>
            {lookOutView && o.lookOutNote && <p className="text-muted-foreground text-xs font-normal text-pretty">{o.lookOutNote}</p>}
          </TableCell>
          <TableCell>
            <OrderStatusBadge status={orderDisplayStatus(o.status, [o.paymentStatus])} />
          </TableCell>
          <TableCell>
            {o.ownerName ?? "—"}
          </TableCell>
          <TableCell numeric className="text-right tabular-nums">{o.startDate}</TableCell>
          <TableCell numeric className="text-right tabular-nums">{fmt(Number(o.total))}</TableCell>
          {costs ? (
            <TableCell numeric className="text-muted-foreground text-right tabular-nums">{costs[o.publicId] == null ? "—" : fmt(costs[o.publicId]!)}</TableCell>
          ) : null}
          <TableCell numeric className="text-right tabular-nums">
            {formatEpoch(o.createdAt, { mode: "date", timeZone: tz })}
          </TableCell>
        </>
      )}
    />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function OrdersListSkeleton() {
  return <TableRowsSkeleton columns={COLUMNS} search="Search orders…" filters={["Status", "Owner", "Plan"]} firstColumnLines={2} />;
}
