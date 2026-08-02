"use client";

import { MapPinnedIcon } from "lucide-react";
import { TableCell } from "@realm/ui/table";
import { DataTable, type Column } from "@/components/ds";
import type { PlannedOrder } from "@/lib/services/optimoroute/push";

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
