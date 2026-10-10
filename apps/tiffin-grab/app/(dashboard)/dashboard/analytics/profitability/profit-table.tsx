"use client";

import { BanknoteIcon } from "lucide-react";
import { DataTable, type Column } from "@/components/ds";
import { TableCell } from "@foundry/ui/table";
import { cn } from "@foundry/ui/cn";
import { periodLabel, type Grain, type ProfitRow } from "@/lib/analytics/profitability";

const COLUMNS: readonly Column<
  "date" | "tiffins" | "cash" | "revenue" | "kitchen" | "driver" | "marketing" | "salaries" | "other" | "profit" | "margin"
>[] = [
  { key: "date", label: "Date" },
  { key: "tiffins", label: "Tiffins delivered", align: "right" },
  { key: "cash", label: "Cash collected", align: "right" },
  { key: "revenue", label: "Revenue earned", align: "right" },
  { key: "kitchen", label: "Kitchen", align: "right" },
  { key: "driver", label: "Driver", align: "right" },
  { key: "marketing", label: "Marketing", align: "right" },
  { key: "salaries", label: "Salaries", align: "right" },
  { key: "other", label: "Other", align: "right" },
  { key: "profit", label: "Profit", align: "right" },
  { key: "margin", label: "Margin", align: "right" },
];

function money(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

function pct(n: number | null) {
  return n == null ? "—" : `${n.toFixed(1)}%`;
}

export function ProfitTable({ rows, grain }: { rows: ProfitRow[]; grain: Grain }) {
  return (
    <DataTable
      pagination="client"
      serial={false}
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.date}
      emptyIcon={BanknoteIcon}
      emptyMessage="No days in this range."
      renderRow={(r) => (
        <>
          <TableCell className="whitespace-nowrap">{periodLabel(r.date, grain)}</TableCell>
          <TableCell className="text-right tabular-nums">{r.tiffins}</TableCell>
          <TableCell className="text-right tabular-nums">{money(r.cashCollected)}</TableCell>
          <TableCell className="text-right tabular-nums">{money(r.revenue)}</TableCell>
          <TableCell className="text-right tabular-nums">{money(r.kitchen)}</TableCell>
          <TableCell className="text-right tabular-nums">{money(r.driver)}</TableCell>
          <TableCell className="text-right tabular-nums">{money(r.marketing)}</TableCell>
          <TableCell className="text-right tabular-nums">{money(r.salaries)}</TableCell>
          <TableCell className="text-right tabular-nums">{money(r.other)}</TableCell>
          <TableCell className={cn("text-right font-medium tabular-nums", r.profit < 0 && "text-destructive")}>
            {money(r.profit)}
          </TableCell>
          <TableCell className="text-right tabular-nums">{pct(r.marginPct)}</TableCell>
        </>
      )}
    />
  );
}
