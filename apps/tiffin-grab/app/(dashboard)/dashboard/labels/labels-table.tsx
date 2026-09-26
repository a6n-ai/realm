"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PackageOpenIcon } from "lucide-react";
import { TableCell } from "@foundry/ui/table";
import { Button } from "@foundry/ui/button";
import { DataTable } from "@/components/ds";
import type { KitchenPackingSheet, KitchenPackingRow } from "@/lib/services/kitchen-packing-sheet.service";

export function LabelsTable({ sheet }: { sheet: KitchenPackingSheet }) {
  const searchParams = useSearchParams();
  const page = parseInt(searchParams.get("page") ?? "0", 10);
  const [planFilter, setPlanFilter] = useState<string>("all");

  if (sheet.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
        <PackageOpenIcon className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">No tiffin deliveries scheduled for this date</p>
        <p className="text-muted-foreground text-xs">Pick a different date above.</p>
      </div>
    );
  }

  const columns = [
    { key: "deliveryDate", label: "Delivery Date" },
    { key: "customer", label: "Customer" },
    { key: "orderId", label: "Order ID" },
    { key: "planName", label: "Plan Name" },
    { key: "mealSize", label: "Meal Size" },
    ...sheet.itemHeaders.map((header) => ({
      key: header,
      label: header,
    })),
  ] as const;

  const plans = Array.from(new Set(sheet.rows.map((r) => r.planName))).sort();
  const shownRows = planFilter === "all" ? sheet.rows : sheet.rows.filter((r) => r.planName === planFilter);

  return (
    // key={dateIso}: client Table cells do not always drop prior-day rows on soft nav.
    <div key={sheet.dateIso}>
      <DataTable
        columns={columns}
        rows={shownRows}
        rowKey={(r: KitchenPackingRow) => `${r.deliveryPublicId}-${r.forDate}`}
        serial={false}
        search={{ keys: ["customerName", "orderId", "planName", "mealSizeName"], placeholder: "Search labels..." }}
        pagination={{ page, size: 25 }}
        filters={
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={planFilter === "all" ? "default" : "outline"}
              onClick={() => setPlanFilter("all")}
            >
              All Plans
            </Button>
            {plans.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={planFilter === p ? "default" : "outline"}
                onClick={() => setPlanFilter(p)}
              >
                {p}
              </Button>
            ))}
          </div>
        }
        emptyIcon={PackageOpenIcon}
        emptyMessage="No labels found."
        renderRow={(row) => (
          <>
            <TableCell className="whitespace-nowrap tabular-nums">{row.deliveryDate}</TableCell>
            <TableCell className="whitespace-nowrap">{row.customerName}{row.forLabel ? ` · ${row.forLabel}` : ""}</TableCell>
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
