"use client";

import Link from "next/link";
import { ReceiptIcon, TriangleAlertIcon } from "lucide-react";
import { round2 } from "@foundry/commons/util/money";
import { DataTable, type Column } from "@/components/ds";
import { TableCell } from "@foundry/ui/table";
import { useFormatMoney } from "@/components/app-currency";
import { cn } from "@foundry/ui/cn";
import type { OrderCostRow } from "@/lib/analytics/order-weeks.service";

type Key = "order" | "tiffins" | "price" | "selling" | "deductions" | "revenue" | "food" | "driver" | "cost" | "profit";

const COLUMNS: readonly Column<Key>[] = [
  { key: "order", label: "Order", width: "w-48" },
  { key: "tiffins", label: "Tiffins", align: "right", width: "w-20" },
  { key: "price", label: "Price / tiffin", align: "right", width: "w-28" },
  { key: "selling", label: "Selling", align: "right", width: "w-24" },
  { key: "deductions", label: "Deductions", align: "right", width: "w-24" },
  { key: "revenue", label: "Revenue", align: "right", width: "w-24" },
  { key: "food", label: "Food", align: "right", width: "w-24" },
  { key: "driver", label: "Driver", align: "right", width: "w-24" },
  { key: "cost", label: "Cost", align: "right", width: "w-24" },
  { key: "profit", label: "Profit", align: "right", width: "w-24" },
];

/** Paid tiffins only — free ones have no selling price. */
function pricePerTiffin(r: OrderCostRow): number | null {
  const paid = r.tiffins - r.free;
  if (paid <= 0) return null;
  return round2(r.revenue / paid);
}

export function OrderCostTable({ rows, emptyMessage = "No delivered orders" }: { rows: OrderCostRow[]; emptyMessage?: string }) {
  const money = useFormatMoney();
  return (
    <DataTable
      pagination="client"
      pageSize={25}
      columns={COLUMNS}
      rows={rows}
      rowKey={(r: OrderCostRow) => r.orderPublicId}
      emptyIcon={ReceiptIcon}
      emptyMessage={emptyMessage}
      renderRow={(r: OrderCostRow) => {
        const per = pricePerTiffin(r);
        return (
          <>
            <TableCell>
              <div className="flex flex-col">
                <Link href={`/dashboard/orders/${r.orderPublicId}`} prefetch={false} className="text-primary font-medium underline-offset-4 hover:underline">
                  {r.deploymentId}
                </Link>
                <span className="text-muted-foreground text-xs">
                  {r.customer} · {r.mealSize}
                </span>
              </div>
            </TableCell>
            <TableCell numeric className="text-right tabular-nums">
              <div className="flex flex-col items-end">
                {r.tiffins}
                {r.free > 0 ? <span className="text-warning text-xs">{r.free} free</span> : null}
              </div>
            </TableCell>
            <TableCell numeric className="text-right tabular-nums">{per == null ? "—" : money(per)}</TableCell>
            <TableCell numeric className="text-right tabular-nums">{money(r.selling)}</TableCell>
            <TableCell numeric className="text-muted-foreground text-right tabular-nums">{r.deductions > 0 ? `−${money(r.deductions)}` : money(0)}</TableCell>
            <TableCell numeric className="text-right tabular-nums">{money(r.revenue)}</TableCell>
            <TableCell numeric className="text-right tabular-nums">
              <span className="inline-flex items-center justify-end gap-1">
                {r.unrated ? (
                  <TriangleAlertIcon className="text-warning size-3.5 shrink-0" aria-label="Some items have no cost rate">
                    <title>Some items have no cost rate</title>
                  </TriangleAlertIcon>
                ) : null}
                {money(r.food)}
              </span>
            </TableCell>
            <TableCell numeric className="text-right tabular-nums">{money(r.driver)}</TableCell>
            <TableCell numeric className="text-right font-medium tabular-nums">{money(round2(r.food + r.driver))}</TableCell>
            <TableCell numeric className={cn("text-right font-medium tabular-nums", r.profit < 0 && "text-destructive")}>{money(r.profit)}</TableCell>
          </>
        );
      }}
    />
  );
}
