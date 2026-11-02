"use client";

import Link from "next/link";
import { FileSearchIcon } from "lucide-react";
import { DataTable, OrderStatusBadge, type Column } from "@/components/ds";
import { TableCell } from "@foundry/ui/table";

export type NeedsReviewTableRow = {
  id: string;
  href: string;
  deploymentId: string;
  fullName: string;
  status: string;
  paid: number;
  total: number;
  diff: number;
  reason: string;
};

const COLUMNS: readonly Column<"order" | "customer" | "status" | "paid" | "total" | "diff" | "reason">[] = [
  { key: "order", label: "Order" },
  { key: "customer", label: "Customer" },
  { key: "status", label: "Status" },
  { key: "paid", label: "Paid", align: "right" },
  { key: "total", label: "Total", align: "right" },
  { key: "diff", label: "Difference", align: "right" },
  { key: "reason", label: "Reason" },
];

const money = (n: number) => n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });

export function NeedsReviewTable({ rows }: { rows: NeedsReviewTableRow[] }) {
  return (
    <DataTable
      pagination="client"
      pageSize={10}
      serial={false}
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.id}
      emptyIcon={FileSearchIcon}
      emptyMessage="Nothing to review in this range"
      renderRow={(r) => (
        <>
          <TableCell className="font-medium">
            <Link href={r.href} className="hover:underline">
              {r.deploymentId}
            </Link>
          </TableCell>
          <TableCell>{r.fullName}</TableCell>
          <TableCell>
            <OrderStatusBadge status={r.status} />
          </TableCell>
          <TableCell className="text-right tabular-nums">{money(r.paid)}</TableCell>
          <TableCell className="text-right tabular-nums">{money(r.total)}</TableCell>
          <TableCell className="text-right tabular-nums">{money(r.diff)}</TableCell>
          <TableCell className="text-muted-foreground text-sm">{r.reason}</TableCell>
        </>
      )}
    />
  );
}
