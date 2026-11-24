"use client";

import { useMemo, useState } from "react";
import { round2 } from "@foundry/commons/util/money";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { useFormatMoney } from "@/components/app-currency";
import { OrderCostTable } from "@/components/dashboard/analytics/order-cost-table";
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
      <OrderCostTable rows={rows} emptyMessage="No delivered orders in this range" />
    </div>
  );
}
