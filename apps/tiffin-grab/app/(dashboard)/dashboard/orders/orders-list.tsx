"use client";

import Link from "next/link";
import { EyeIcon, FlaskConicalIcon, PackageIcon, RefreshCwIcon, type LucideIcon } from "lucide-react";
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

/** A small icon after the customer's name; hover shows what it means. */
function RowTag({ icon: Icon, label, title, className }: { icon: LucideIcon; label: string; title?: string; className: string }) {
  return (
    <span title={title ?? label} className={`ml-2 inline-flex align-middle ${className}`}>
      <Icon className="size-4" aria-label={label} />
    </span>
  );
}

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
  return (
    <div className="space-y-4">
    <DataTable
      serialOffset={page * size}
      columns={COLUMNS}
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
            {o.trial && <RowTag icon={FlaskConicalIcon} label="Trial" className="text-amber-600 dark:text-amber-400" />}
            {o.lookOut && !lookOutView && (
              <RowTag icon={EyeIcon} label="Look out for" title={o.lookOutNote ? `Look out for: ${o.lookOutNote}` : undefined} className="text-warn" />
            )}
            {endingView && o.renewed && (
              <RowTag icon={RefreshCwIcon} label="Renewed" title="Renewed: next plan already booked" className="text-emerald-600 dark:text-emerald-400" />
            )}
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
