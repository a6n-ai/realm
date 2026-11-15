"use client";

import Link from "next/link";
import { ReceiptIcon } from "lucide-react";
import { DataTable, type Column } from "@/components/ds";
import { TableCell } from "@foundry/ui/table";
import { Badge } from "@/components/reui/badge";
import { useFormatMoney } from "@/components/app-currency";
import { cn } from "@foundry/ui/cn";
import type { OrderCostRow, OrderWeek } from "@/lib/analytics/order-weeks.service";

const COLUMNS: readonly Column<"order" | "customer" | "meal" | "tiffins" | "revenue" | "food" | "driver" | "profit">[] = [
  { key: "order", label: "Order" },
  { key: "customer", label: "Customer" },
  { key: "meal", label: "Meal size" },
  { key: "tiffins", label: "Tiffins", align: "right" },
  { key: "revenue", label: "Revenue", align: "right" },
  { key: "food", label: "Food", align: "right" },
  { key: "driver", label: "Driver", align: "right" },
  { key: "profit", label: "Profit", align: "right" },
];

export function OrderWeeksTable({ weeks }: { weeks: OrderWeek[] }) {
  const money = useFormatMoney();
  if (weeks.length === 0) {
    return <p className="text-muted-foreground text-sm">No delivered orders in this range.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {weeks.map((w) => (
        <section key={w.key} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">Week of {w.label}</h3>
            <p className="text-muted-foreground text-xs tabular-nums">
              {`${w.totals.orders} ${w.totals.orders === 1 ? "order" : "orders"} · ${w.totals.tiffins} tiffins · Revenue ${money(w.totals.revenue)} · Food ${money(w.totals.food)} · Driver ${money(w.totals.driver)} · Profit ${money(w.totals.profit)}`}
            </p>
          </div>
          <DataTable
            pagination="client"
            pageSize={10}
            serial={false}
            columns={COLUMNS}
            rows={w.orders}
            rowKey={(r: OrderCostRow) => r.orderPublicId}
            emptyIcon={ReceiptIcon}
            emptyMessage="No delivered orders this week"
            renderRow={(r: OrderCostRow) => (
              <>
                <TableCell className="font-medium">
                  <Link href={`/dashboard/orders/${r.orderPublicId}`} className="hover:underline">
                    {r.deploymentId}
                  </Link>
                </TableCell>
                <TableCell>{r.customer}</TableCell>
                <TableCell>{r.mealSize}</TableCell>
                <TableCell className="text-right tabular-nums">{r.tiffins}</TableCell>
                <TableCell className="text-right tabular-nums">{money(r.revenue)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <span className="inline-flex items-center justify-end gap-2">
                    {r.unrated ? <Badge variant="warning-light">Missing rate</Badge> : null}
                    {money(r.food)}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(r.driver)}</TableCell>
                <TableCell className={cn("text-right font-medium tabular-nums", r.profit < 0 && "text-destructive")}>{money(r.profit)}</TableCell>
              </>
            )}
          />
        </section>
      ))}
    </div>
  );
}
