"use client";

import { useMemo, useState } from "react";
import { PackageOpenIcon } from "lucide-react";
import { TableCell } from "@foundry/ui/table";
import { Button } from "@foundry/ui/button";
import { DataTable, type Column } from "@/components/ds";
import { sortRows } from "@/lib/list/sort";
import type { KitchenPackingSheet, KitchenPackingRow } from "@/lib/services/kitchen-packing-sheet.service";
import { useTableParams } from "./use-table-params";

export function LabelsTable({ sheet }: { sheet: KitchenPackingSheet }) {
  const [planFilter, setPlanFilter] = useState<string>("all");

  // Item headers ("Item1"…) come from the sheet, so they are sortable keys too.
  const columns: Column<string>[] = useMemo(
    () => [
      { key: "customer", label: "Customer", sortable: true },
      { key: "phone", label: "Phone", sortable: true },
      { key: "driver", label: "Driver", sortable: true },
      { key: "driverSerial", label: "Driver #", sortable: true, align: "right" },
      { key: "stop", label: "Stop #", sortable: true, align: "right" },
      { key: "orderId", label: "Order ID", sortable: true },
      { key: "planName", label: "Plan", sortable: true },
      { key: "mealSize", label: "Meal size", sortable: true },
      ...sheet.itemHeaders.map((header) => ({ key: header, label: header, sortable: true })),
    ],
    [sheet.itemHeaders],
  );
  const { sort, pagination } = useTableParams<string>(
    columns.map((c) => c.key),
    { column: "customer", dir: "asc" },
  );

  const plans = useMemo(() => Array.from(new Set(sheet.rows.map((r) => r.planName))).sort(), [sheet.rows]);
  const shownRows = useMemo(() => {
    const filtered = planFilter === "all" ? sheet.rows : sheet.rows.filter((r) => r.planName === planFilter);
    return sortRows(filtered, sort, (r: KitchenPackingRow, column) => {
      switch (column) {
        case "customer":
          return r.customerName;
        case "phone":
          return r.phone ?? "";
        case "driver":
          return r.routeDriver ?? "";
        case "driverSerial":
          return r.routeDriverSerial ?? "";
        case "stop":
          return r.routeStopNumber ?? "";
        case "orderId":
          return r.orderId;
        case "planName":
          return r.planName;
        case "mealSize":
          return r.mealSizeName;
        default:
          return r.items[sheet.itemHeaders.indexOf(column)];
      }
    });
  }, [planFilter, sheet.rows, sheet.itemHeaders, sort]);

  if (sheet.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
        <PackageOpenIcon className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">No tiffin deliveries scheduled for this date</p>
        <p className="text-muted-foreground text-xs">Pick a different date above.</p>
      </div>
    );
  }

  const planCount = (plan: string) => sheet.rows.filter((r) => r.planName === plan).length;

  return (
    // key={dateIso}: client Table cells do not always drop prior-day rows on soft nav.
    <div key={sheet.dateIso}>
      <DataTable
        columns={columns}
        rows={shownRows}
        rowKey={(r) => `${r.deliveryPublicId}-${r.forDate}`}
        sort={sort}
        search={{
          keys: ["customerName", "phone", "routeDriver", "routeDriverSerial", "orderId", "planName", "mealSizeName"],
          placeholder: "Search customer, phone, driver, order…",
        }}
        pagination={pagination}
        filters={
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={planFilter === "all" ? "default" : "outline"} onClick={() => setPlanFilter("all")}>
              All plans <span className="tabular-nums opacity-70">{sheet.rows.length}</span>
            </Button>
            {plans.map((p) => (
              <Button key={p} size="sm" variant={planFilter === p ? "default" : "outline"} onClick={() => setPlanFilter(p)}>
                {p} <span className="tabular-nums opacity-70">{planCount(p)}</span>
              </Button>
            ))}
          </div>
        }
        emptyIcon={PackageOpenIcon}
        emptyMessage="No labels found."
        renderRow={(row) => (
          <>
            <TableCell className="whitespace-nowrap">
              {row.customerName}
              {row.forLabel ? <span className="text-muted-foreground"> · {row.forLabel}</span> : null}
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">{row.phone ?? "—"}</TableCell>
            <TableCell className="whitespace-nowrap">{row.routeDriver ?? "—"}</TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums">{row.routeDriverSerial ?? "—"}</TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums">{row.routeStopNumber ?? "—"}</TableCell>
            <TableCell className="whitespace-nowrap font-mono text-xs">{row.orderId}</TableCell>
            <TableCell className="whitespace-nowrap">{row.planName}</TableCell>
            <TableCell className="whitespace-nowrap">{row.mealSizeName}</TableCell>
            {sheet.itemHeaders.map((header, itemIdx) => (
              <TableCell key={header} className="whitespace-nowrap">
                {row.items[itemIdx] ?? "—"}
              </TableCell>
            ))}
          </>
        )}
      />
    </div>
  );
}
