"use client";

import Link from "next/link";
import { PackageIcon } from "lucide-react";
import { formatMoney as fmt } from "@foundry/commons";
import { DataTable, ListPagination, OrderStatusBadge, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import { TableCell } from "@foundry/ui/table";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { OrderListRow, OrderSortColumn } from "@/lib/services/orders.service";
import { orderDisplayStatus } from "@/lib/orders/display-status";
import type { SortState } from "@/lib/list/sort";
import { ReassignControl } from "@/components/reassign/reassign-control";
import { reassignOrderAction } from "./actions";
import { RowTag } from "./row-tags";

// ORDER_STATUS_PILLS lives in ./status-pills (a non-client module) because the
// server page maps over it; re-exporting it here would hand the RSC graph a
// client reference instead of the array.

type ListColumn = OrderSortColumn | "deployment" | "city" | "owner" | "wallet" | "spent";

// Single source of truth for the table's columns. DataTable renders the header
// and DataTable.Skeleton renders the loading twin from this same array, so the
// two can never drift. "deployment" isn't a server sort key (see
// OrderSortColumn), so it's a plain non-sortable column here.
// Wallet + Spent only on Ending soon (renewal outreach).
function orderColumns(endingView: boolean): readonly Column<ListColumn>[] {
  return [
    { key: "name", label: "Name", sortable: true },
    { key: "deployment", label: "Deployment", sortable: false },
    { key: "city", label: "City" },
    { key: "status", label: "Status", sortable: true },
    { key: "owner", label: "Owner", sortable: false },
    { key: "start", label: "Start", sortable: true, align: "right" },
    { key: "total", label: "Total", sortable: true, align: "right" },
    ...(endingView
      ? [
          { key: "wallet" as const, label: "Wallet", sortable: false, align: "right" as const },
          { key: "spent" as const, label: "Spent", sortable: false, align: "right" as const },
        ]
      : []),
    { key: "created", label: "Created", sortable: true, align: "right" },
  ];
}

export function OrdersList({
  spec,
  rows,
  total,
  page,
  size,
  sort,
  canReassign,
  staff,
  lookOutView = false,
  endingView = false,
  paymentReviewView = false,
}: {
  spec: FacetDef[];
  rows: OrderListRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<OrderSortColumn>;
  canReassign: boolean;
  staff: { publicId: string; name: string }[];
  /** The Look out for tab: each row shows why it was flagged. */
  lookOutView?: boolean;
  /** The Ending soon tab: each row shows its last tiffin date. */
  endingView?: boolean;
  paymentReviewView?: boolean;
}) {
  const tz = useTimezone();
  const columns = orderColumns(endingView);
  return (
    <div className="space-y-4">
    <DataTable
      serialOffset={page * size}
      columns={columns}
      rows={rows}
      rowKey={(o) => o.publicId}
      sort={sort}
      idAccessor={(o) => o.publicId}
      idHref={(o) => `/dashboard/orders/${o.publicId}`}
      rowClassName={() => "group cursor-pointer"}
      filters={<ListSearchFilters spec={spec} placeholder="Search orders…" shortPlaceholder="Search…" dateControl="external" />}
      emptyIcon={PackageIcon}
      emptyMessage={lookOutView ? "No orders are marked look out for." : endingView ? "No plans end in the next two days." : paymentReviewView ? "No payments are waiting for review." : "No orders yet."}
      emptySearchMessage="No orders match your search."
      renderRow={(o) => (
        <>
          <TableCell className="font-medium">
            <Link href={`/dashboard/orders/${o.publicId}`} className="group-hover:underline">
              {o.fullName}
            </Link>
            {o.trial && <RowTag tag="trial" />}
            {o.lookOut && !lookOutView && <RowTag tag="lookOut" title={o.lookOutNote ? `Look out for: ${o.lookOutNote}` : undefined} />}
            {endingView && o.renewed && <RowTag tag="renewed" title="Renewed: next plan already booked" />}
            {lookOutView && o.lookOutNote && <p className="text-muted-foreground text-xs font-normal text-pretty">{o.lookOutNote}</p>}
            {endingView && o.lastTiffin && <p className="text-muted-foreground text-xs font-normal tabular-nums">Last tiffin {o.lastTiffin}</p>}
          </TableCell>
          <TableCell>{o.deploymentId}</TableCell>
          <TableCell>{o.city}</TableCell>
          <TableCell>
            <OrderStatusBadge status={orderDisplayStatus(o.status, [o.paymentStatus])} />
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
          {endingView && (
            <>
              <TableCell className="text-right tabular-nums">
                <span className="font-medium">{o.walletCoins ?? 0}</span>
                <p className="text-muted-foreground text-xs font-normal">coins</p>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="font-medium">{fmt(Number(o.totalSpent ?? 0))}</span>
                <p className="text-muted-foreground text-xs font-normal">
                  {o.prevOrderTotal != null ? `Prev ${fmt(Number(o.prevOrderTotal))}` : "No prev plan"}
                </p>
              </TableCell>
            </>
          )}
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
export function OrdersListSkeleton({ endingView = false }: { endingView?: boolean }) {
  return <DataTable.Skeleton columns={orderColumns(endingView)} hasId />;
}
