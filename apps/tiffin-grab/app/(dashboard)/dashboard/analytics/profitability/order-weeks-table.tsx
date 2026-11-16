"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ReceiptIcon, TriangleAlertIcon } from "lucide-react";
import { round2 } from "@foundry/commons/util/money";
import { DataTable, type Column } from "@/components/ds";
import { TableCell } from "@foundry/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { useFormatMoney } from "@/components/app-currency";
import { cn } from "@foundry/ui/cn";
import type { OrderCostRow, OrderWeek } from "@/lib/analytics/order-weeks.service";

type Row = OrderCostRow;
type Sum = "tiffins" | "free" | "selling" | "deductions" | "revenue" | "food" | "driver" | "profit";
const SUMS: Sum[] = ["tiffins", "free", "selling", "deductions", "revenue", "food", "driver", "profit"];

/** One row per order: All weeks folds an order's weekly rows into one. */
function byOrder(rows: Row[]): Row[] {
  const out = new Map<string, Row>();
  for (const r of rows) {
    const acc = out.get(r.orderPublicId);
    if (!acc) {
      out.set(r.orderPublicId, { ...r });
      continue;
    }
    for (const k of SUMS) acc[k] = round2(acc[k] + r[k]);
    acc.unrated ||= r.unrated;
  }
  return [...out.values()];
}

type Key = "order" | "tiffins" | "selling" | "deductions" | "revenue" | "food" | "driver" | "cost" | "profit";
const COLUMNS: readonly Column<Key>[] = [
  { key: "order", label: "Order", width: "w-48" },
  { key: "tiffins", label: "Tiffins", align: "right", width: "w-20" },
  { key: "selling", label: "Selling", align: "right", width: "w-24" },
  { key: "deductions", label: "Deductions", align: "right", width: "w-24" },
  { key: "revenue", label: "Revenue", align: "right", width: "w-24" },
  { key: "food", label: "Food", align: "right", width: "w-24" },
  { key: "driver", label: "Driver", align: "right", width: "w-24" },
  { key: "cost", label: "Cost", align: "right", width: "w-24" },
  { key: "profit", label: "Profit", align: "right", width: "w-24" },
];

const ALL = "all";

export function OrderWeeksTable({ weeks }: { weeks: OrderWeek[] }) {
  const money = useFormatMoney();
  const [week, setWeek] = useState<string>(weeks[0]?.key ?? ALL);

  const rows = useMemo<Row[]>(
    () => byOrder(weeks.filter((w) => week === ALL || w.key === week).flatMap((w) => w.orders)).sort((a, b) => a.profit - b.profit),
    [weeks, week],
  );
  const total = (k: Sum) => round2(rows.reduce((s, r) => s + r[k], 0));
  const orders = rows.length;

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
          {`${orders} ${orders === 1 ? "order" : "orders"} · ${total("tiffins")} tiffins${total("free") > 0 ? ` (${total("free")} free)` : ""} · Selling ${money(total("selling"))} · Deductions ${money(total("deductions"))} · Revenue ${money(total("revenue"))} · Food ${money(total("food"))} · Driver ${money(total("driver"))} · Cost ${money(round2(total("food") + total("driver")))} · Profit ${money(total("profit"))}`}
        </p>
      </div>
      <DataTable
        pagination="client"
        pageSize={25}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r: Row) => r.orderPublicId}
        emptyIcon={ReceiptIcon}
        emptyMessage="No delivered orders in this range"
        renderRow={(r: Row) => (
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
            <TableCell className="text-right tabular-nums">
              <div className="flex flex-col items-end">
                {r.tiffins}
                {r.free > 0 ? <span className="text-warning text-xs">{r.free} free</span> : null}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{money(r.selling)}</TableCell>
            <TableCell className="text-muted-foreground text-right tabular-nums">{r.deductions > 0 ? `−${money(r.deductions)}` : money(0)}</TableCell>
            <TableCell className="text-right tabular-nums">{money(r.revenue)}</TableCell>
            <TableCell className="text-right tabular-nums">
              <span className="inline-flex items-center justify-end gap-1">
                {r.unrated ? (
                  <TriangleAlertIcon className="text-warning size-3.5 shrink-0" aria-label="Some items have no cost rate">
                    <title>Some items have no cost rate</title>
                  </TriangleAlertIcon>
                ) : null}
                {money(r.food)}
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">{money(r.driver)}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">{money(round2(r.food + r.driver))}</TableCell>
            <TableCell className={cn("text-right font-medium tabular-nums", r.profit < 0 && "text-destructive")}>{money(r.profit)}</TableCell>
          </>
        )}
      />
    </div>
  );
}
