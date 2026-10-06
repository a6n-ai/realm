"use client";

import { useMemo, useState } from "react";
import { TruckIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { TableCell } from "@foundry/ui/table";
import { DataTable, type Column } from "@/components/ds";
import { sortRows } from "@/lib/list/sort";
import type { DayDeliveryStatusRow, LabelDeliveryStatus } from "@/lib/services/daily-labels.service";
import { useTableParams } from "./use-table-params";

type Key = "customer" | "orderId" | "planName" | "mealSize" | "tiffins" | "status";

const COLUMNS: readonly Column<Key>[] = [
  { key: "customer", label: "Customer", sortable: true },
  { key: "orderId", label: "Order ID", sortable: true },
  { key: "planName", label: "Plan", sortable: true },
  { key: "mealSize", label: "Meal size", sortable: true },
  { key: "tiffins", label: "Tiffins", sortable: true, align: "right" },
  { key: "status", label: "Status", sortable: true },
];

const VALUE: Record<Key, (r: DayDeliveryStatusRow) => string | number> = {
  customer: (r) => r.customerName,
  orderId: (r) => r.orderId,
  planName: (r) => r.planName,
  mealSize: (r) => r.mealSizeName,
  tiffins: (r) => r.tiffinUnits,
  status: (r) => r.status,
};

export function DeliveryStatusList({ rows }: { rows: DayDeliveryStatusRow[] }) {
  const [statusFilter, setStatusFilter] = useState<LabelDeliveryStatus | "all">("all");
  const { sort, pagination } = useTableParams(
    COLUMNS.map((c) => c.key),
    { column: "customer", dir: "asc" },
  );

  const statusCounts = useMemo(() => {
    const counts = new Map<LabelDeliveryStatus, number>();
    for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const shown = useMemo(() => {
    const filtered = statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter);
    return sortRows(filtered, sort, (r, column) => VALUE[column](r));
  }, [rows, statusFilter, sort]);

  return (
    <DataTable
      columns={COLUMNS}
      rows={shown}
      rowKey={(r) => r.deliveryPublicId}
      sort={sort}
      search={{ keys: ["customerName", "orderId", "planName", "mealSizeName", "status"], placeholder: "Search deliveries..." }}
      pagination={pagination}
      filters={
        statusCounts.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"} onClick={() => setStatusFilter("all")}>
              All <span className="tabular-nums opacity-70">{rows.length}</span>
            </Button>
            {statusCounts.map(([status, n]) => (
              <Button
                key={status}
                size="sm"
                variant={statusFilter === status ? "default" : "outline"}
                onClick={() => setStatusFilter(status)}
              >
                {status} <span className="tabular-nums opacity-70">{n}</span>
              </Button>
            ))}
          </div>
        ) : undefined
      }
      emptyIcon={TruckIcon}
      emptyMessage="No tiffin deliveries for this date."
      emptySearchMessage="No deliveries match that search."
      renderRow={(row) => (
        <>
          <TableCell className="whitespace-nowrap">{row.customerName}</TableCell>
          <TableCell className="whitespace-nowrap font-mono text-xs">{row.orderId}</TableCell>
          <TableCell className="whitespace-nowrap">{row.planName}</TableCell>
          <TableCell className="whitespace-nowrap">{row.mealSizeName}</TableCell>
          <TableCell className="text-right tabular-nums">{row.tiffinUnits}</TableCell>
          <TableCell className="whitespace-nowrap">
            <DeliveryStatusBadge status={row.status} />
          </TableCell>
        </>
      )}
    />
  );
}

function DeliveryStatusBadge({ status }: { status: LabelDeliveryStatus }) {
  const variant = status === "Delivery failed" || status === "Cancelled" ? "destructive" : status === "Delivered" ? "secondary" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}
