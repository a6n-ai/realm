"use client";

import { useMemo, useState, type ReactNode } from "react";
import { round2 } from "@foundry/commons/util/money";
import { ResponsiveDialog } from "@/components/ds";
import { useFormatMoney } from "@/components/app-currency";
import { signedMoney } from "@/components/dashboard/analytics/day-card";
import { OrderCostTable } from "@/components/dashboard/analytics/order-cost-table";
import { cn } from "@foundry/ui/cn";
import type { OrderCostRow } from "@/lib/analytics/order-weeks.service";

type Props = {
  title: string;
  /** Card face (date, revenue, deliveries, profit). */
  trigger: ReactNode;
  /** Extra summary lines shown above the order table (popover-style details). */
  summary?: [string, string][];
  orders: OrderCostRow[];
  /** Day profit from the scorecard (includes monthly overhead). */
  dayProfit: number | null;
  muted?: boolean;
};

/**
 * Clickable day card → dialog with every order that fed that day's profitability
 * (earned revenue, food, driver). Monthly marketing/salaries/other stay in the
 * day total only — they are not split onto orders.
 */
export function DayOrdersDialog({ title, trigger, summary, orders, dayProfit, muted }: Props) {
  const [open, setOpen] = useState(false);
  const money = useFormatMoney();
  const totals = useMemo(() => {
    const sum = (k: keyof Pick<OrderCostRow, "tiffins" | "revenue" | "food" | "driver" | "profit">) =>
      round2(orders.reduce((s, r) => s + r[k], 0));
    return {
      orders: orders.length,
      tiffins: sum("tiffins"),
      revenue: sum("revenue"),
      cost: round2(sum("food") + sum("driver")),
      contribution: sum("profit"),
    };
  }, [orders]);
  const overhead =
    dayProfit != null ? round2(dayProfit - totals.contribution) : null;
  const profitTone =
    dayProfit == null || dayProfit === 0
      ? "text-muted-foreground"
      : dayProfit < 0
        ? "text-destructive"
        : "text-success-foreground dark:text-success";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          className={cn(
            "bg-card focus-visible:ring-ring/50 flex h-full w-full min-w-0 flex-col gap-1.5 rounded-lg border p-3 text-left text-sm outline-none focus-visible:ring-2",
            muted && "text-muted-foreground",
          )}
        >
          {trigger}
        </button>
      }
      title={title}
      description="Orders with a successful delivery that day. Price / tiffin is the earned share (ex tax) after discounts. Cost is food + driver; monthly overhead is not on each order."
      contentClassName="sm:max-w-5xl"
    >
      <div className="flex flex-col gap-4">
        {summary && summary.length > 0 ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs tabular-nums sm:grid-cols-3">
            {summary.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="text-muted-foreground text-xs tabular-nums">
          {totals.orders === 0
            ? "No delivered tiffins this day — the day profit is monthly overhead only."
            : `${totals.orders} ${totals.orders === 1 ? "order" : "orders"} · ${totals.tiffins} tiffins · Revenue ${money(totals.revenue)} · Cost ${money(totals.cost)} · Contribution ${signedMoney(totals.contribution, money)}${
                overhead != null && overhead !== 0 ? ` · Overhead ${signedMoney(overhead, money)}` : ""
              }${dayProfit != null ? ` · Day profit ${signedMoney(dayProfit, money)}` : ""}`}
        </p>
        {dayProfit != null ? (
          <p className={cn("text-sm font-semibold tabular-nums", profitTone)}>{signedMoney(dayProfit, money)}</p>
        ) : null}
        <OrderCostTable rows={orders} emptyMessage="No delivered orders on this day" />
      </div>
    </ResponsiveDialog>
  );
}
