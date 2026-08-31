"use client";

import { PackageIcon } from "lucide-react";
import { DataTable, type Column } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { TableCell } from "@realm/ui/table";

type OrderRow = {
  publicId: string;
  status: string;
  total: string;
  createdAt: number;
  totalLabel: string;
  createdAtLabel: string;
};

export const CUSTOMER_ORDER_COLUMNS: readonly Column<"order" | "status" | "createdAt" | "total">[] = [
  { key: "order", label: "Order" },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Placed", align: "right" },
  { key: "total", label: "Total", align: "right" },
];

export function CustomerOrdersTable({ rows }: { rows: OrderRow[] }) {
  return (
    <DataTable
      columns={CUSTOMER_ORDER_COLUMNS}
      rows={rows}
      rowKey={(r) => r.publicId}
      serial={false}
      idHref={(r) => `/dashboard/orders/${r.publicId}`}
      emptyIcon={PackageIcon}
      emptyMessage="No orders yet."
      renderRow={(r) => (
        <>
          <TableCell className="font-mono text-xs">{r.publicId}</TableCell>
          <TableCell>
            <Badge variant="outline">{r.status}</Badge>
          </TableCell>
          <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
            {r.createdAtLabel}
          </TableCell>
          <TableCell className="text-right tabular-nums">{r.totalLabel}</TableCell>
        </>
      )}
    />
  );
}
