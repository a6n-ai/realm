"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ReceiptIcon } from "lucide-react";
import { round2 } from "@foundry/commons/util/money";
import { DataTable, type Column } from "@/components/ds";
import { TableCell } from "@foundry/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Badge } from "@/components/reui/badge";
import { useFormatMoney } from "@/components/app-currency";
import { cn } from "@foundry/ui/cn";
import type { OrderCostRow, OrderWeek } from "@/lib/analytics/order-weeks.service";

type Row = OrderCostRow & { week: string; weekKey: string };

const COLUMNS: readonly Column<"week" | "order" | "customer" | "meal" | "price" | "tiffins" | "revenue" | "food" | "driver" | "profit">[] = [
  { key: "week", label: "Week" },
  { key: "order", label: "Order" },
  { key: "customer", label: "Customer" },
  { key: "meal", label: "Meal size" },
  { key: "price", label: "Price / tiffin", align: "right" },
  { key: "tiffins", label: "Tiffins", align: "right" },
  { key: "revenue", label: "Revenue", align: "right" },
  { key: "food", label: "Food", align: "right" },
  { key: "driver", label: "Driver", align: "right" },
  { key: "profit", label: "Profit", align: "right" },
];

const ALL = "all";

export function OrderWeeksTable({ weeks }: { weeks: OrderWeek[] }) {
  const money = useFormatMoney();
  const [week, setWeek] = useState<string>(weeks[0]?.key ?? ALL);

  const rows = useMemo<Row[]>(
    () =>
      weeks
        .filter((w) => week === ALL || w.key === week)
        .flatMap((w) => w.orders.map((o) => ({ ...o, week: w.label, weekKey: w.key })))
        .sort((a, b) => a.profit - b.profit),
    [weeks, week],
  );
  const total = (k: "tiffins" | "revenue" | "food" | "driver" | "profit") => round2(rows.reduce((s, r) => s + r[k], 0));
  const orders = new Set(rows.map((r) => r.orderPublicId)).size;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={week} onValueChange={setWeek}>
          <SelectTrigger className="w-full sm:w-64" aria-label="Week">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All weeks</SelectItem>
            {weeks.map((w) => (
              <SelectItem key={w.key} value={w.key}>
                Week of {w.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs tabular-nums">
          {`${orders} ${orders === 1 ? "order" : "orders"} · ${total("tiffins")} tiffins · Revenue ${money(total("revenue"))} · Food ${money(total("food"))} · Driver ${money(total("driver"))} · Profit ${money(total("profit"))}`}
        </p>
      </div>
      <DataTable
        pagination="client"
        pageSize={25}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r: Row) => `${r.weekKey}:${r.orderPublicId}`}
        emptyIcon={ReceiptIcon}
        emptyMessage="No delivered orders in this range"
        renderRow={(r: Row) => (
          <>
            <TableCell className="text-muted-foreground whitespace-nowrap">{r.week}</TableCell>
            <TableCell className="font-medium">
              <Link href={`/dashboard/orders/${r.orderPublicId}`} prefetch={false} className="text-primary underline-offset-4 hover:underline">
                {r.deploymentId}
              </Link>
            </TableCell>
            <TableCell>{r.customer}</TableCell>
            <TableCell>{r.mealSize}</TableCell>
            <TableCell className="text-right tabular-nums">{money(r.pricePerTiffin)}</TableCell>
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
    </div>
  );
}
