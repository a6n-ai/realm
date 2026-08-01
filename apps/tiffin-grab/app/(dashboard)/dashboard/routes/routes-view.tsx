"use client";

import { MapPinnedIcon, TrashIcon } from "lucide-react";
import { TableCell } from "@realm/ui/table";
import { DataTable, EmptyState, type Column } from "@/components/ds";
import type { PlannedOrder, PushPreview } from "@/lib/services/optimoroute/push";

const PLANNED_COLUMNS: readonly Column<"customer" | "address" | "duration" | "notes">[] = [
  { key: "customer", label: "Customer" },
  { key: "address", label: "Address" },
  { key: "duration", label: "Stop mins", align: "right" },
  { key: "notes", label: "Notes" },
];

export function PlannedOrders({ rows }: { rows: PlannedOrder[] }) {
  return (
    <DataTable
      columns={PLANNED_COLUMNS}
      rows={rows}
      rowKey={(r) => r.orderNo}
      serial={false}
      emptyIcon={MapPinnedIcon}
      emptyMessage="Nothing in this group."
      renderRow={(r) => (
        <>
          <TableCell className="font-medium">
            {r.customerName}
            <span className="text-muted-foreground block text-xs">{r.plan}</span>
          </TableCell>
          <TableCell className="text-muted-foreground max-w-[280px] truncate text-xs">
            {r.address}
          </TableCell>
          <TableCell className="text-right tabular-nums">{r.durationMins}</TableCell>
          <TableCell className="text-muted-foreground max-w-[200px] truncate text-xs">
            {r.notes || "—"}
          </TableCell>
        </>
      )}
      mobileCard={(r) => (
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">{r.customerName}</p>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {r.durationMins}m
            </span>
          </div>
          <p className="text-muted-foreground text-xs">{r.address}</p>
          {r.notes ? <p className="text-muted-foreground text-xs">{r.notes}</p> : null}
        </div>
      )}
    />
  );
}

const REMOVE_COLUMNS: readonly Column<"orderNo" | "driver" | "address">[] = [
  { key: "orderNo", label: "Order no" },
  { key: "driver", label: "Driver" },
  { key: "address", label: "Address" },
];

/**
 * Stops OptimoRoute still has that we no longer schedule — a customer who paused or
 * skipped after the last push. Left on a route, a driver drives to an empty door.
 */
export function RemovedOrders({ rows }: { rows: PushPreview["remove"] }) {
  if (rows.length === 0) {
    return <EmptyState icon={TrashIcon} message="Nothing stale on OptimoRoute." />;
  }
  return (
    <DataTable
      columns={REMOVE_COLUMNS}
      rows={rows}
      rowKey={(r) => r.orderNo}
      serial={false}
      emptyIcon={TrashIcon}
      emptyMessage="Nothing stale on OptimoRoute."
      renderRow={(r) => (
        <>
          <TableCell className="font-mono text-xs">{r.orderNo}</TableCell>
          <TableCell>{r.driver ?? "—"}</TableCell>
          <TableCell className="text-muted-foreground max-w-[280px] truncate text-xs">
            {r.address ?? "—"}
          </TableCell>
        </>
      )}
      mobileCard={(r) => (
        <div className="space-y-1">
          <p className="font-mono text-xs">{r.orderNo}</p>
          <p className="text-muted-foreground text-xs">
            {r.driver ?? "—"} · {r.address ?? "—"}
          </p>
        </div>
      )}
    />
  );
}
