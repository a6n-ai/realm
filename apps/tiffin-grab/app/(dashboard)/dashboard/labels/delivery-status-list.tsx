"use client";

import { useMemo, useState } from "react";
import { TruckIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { Input } from "@foundry/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import type { DayDeliveryStatusRow, LabelDeliveryStatus } from "@/lib/services/daily-labels.service";

export function DeliveryStatusList({ rows }: { rows: DayDeliveryStatusRow[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.customerName, row.orderId, row.planName, row.mealSizeName, row.status]
        .some((value) => value.toLowerCase().includes(needle)),
    );
  }, [query, rows]);

  return (
    <div className="space-y-3">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search deliveries..."
        aria-label="Search deliveries"
      />
      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <TruckIcon className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            {rows.length === 0 ? "No tiffin deliveries for this date." : "No deliveries match that search."}
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Order ID</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Meal size</TableHead>
              <TableHead className="text-right">Tiffins</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((row) => (
              <TableRow key={row.deliveryPublicId}>
                <TableCell className="whitespace-nowrap">{row.customerName}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs">{row.orderId}</TableCell>
                <TableCell className="whitespace-nowrap">{row.planName}</TableCell>
                <TableCell className="whitespace-nowrap">{row.mealSizeName}</TableCell>
                <TableCell className="text-right tabular-nums">{row.tiffinUnits}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <DeliveryStatusBadge status={row.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function DeliveryStatusBadge({ status }: { status: LabelDeliveryStatus }) {
  const variant = status === "Not delivered" || status === "Cancelled" ? "destructive" : status === "Delivered" ? "secondary" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}
