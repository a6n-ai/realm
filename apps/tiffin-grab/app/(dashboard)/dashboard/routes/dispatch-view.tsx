"use client";

import { useState, useTransition } from "react";
import { TruckIcon } from "lucide-react";
import { TableCell } from "@foundry/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { DataTable, type Column } from "@/components/ds";
import { reassignDriverAction } from "./actions";
import type { DispatchRow, KnownDriver } from "@/lib/services/optimoroute/drivers";

const COLUMNS: readonly Column<"customer" | "driver" | "stop">[] = [
  { key: "customer", label: "Customer" },
  { key: "driver", label: "Driver" },
  { key: "stop", label: "Stop #", align: "right" },
];

export function DispatchView({
  date,
  rows,
  drivers,
}: {
  date: string;
  rows: DispatchRow[];
  drivers: KnownDriver[];
}) {
  const [pending, startTransition] = useTransition();
  const [errorFor, setErrorFor] = useState<string | null>(null);

  function reassign(orderNo: string, driverSerial: string) {
    setErrorFor(null);
    startTransition(async () => {
      const result = await reassignDriverAction(orderNo, date, driverSerial);
      if (!result.ok) setErrorFor(orderNo);
    });
  }

  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.orderNo}
      serial={false}
      emptyIcon={TruckIcon}
      emptyMessage="No routes pulled for this date yet."
      renderRow={(r) => (
        <>
          <TableCell className="font-medium">{r.customerName}</TableCell>
          <TableCell>
            <Select
              disabled={pending}
              defaultValue={r.routeDriverSerial ?? undefined}
              onValueChange={(v) => reassign(r.orderNo, v)}
            >
              <SelectTrigger className="h-8 w-40">
                <SelectValue placeholder={r.routeDriverName ?? "Unassigned"} />
              </SelectTrigger>
              <SelectContent>
                {drivers.map((d) => (
                  <SelectItem key={d.driverSerial} value={d.driverSerial}>
                    {d.driverName ?? d.driverSerial}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errorFor === r.orderNo ? (
              <p className="text-destructive mt-1 text-xs">Could not reassign — try again.</p>
            ) : null}
          </TableCell>
          <TableCell className="text-right tabular-nums">{r.routeStopNumber ?? "—"}</TableCell>
        </>
      )}
      mobileCard={(r) => (
        <div className="space-y-1">
          <p className="text-sm font-medium">{r.customerName}</p>
          <p className="text-muted-foreground text-xs">
            {r.routeDriverName ?? "Unassigned"}
            {r.routeStopNumber != null ? ` · stop ${r.routeStopNumber}` : ""}
          </p>
        </div>
      )}
    />
  );
}
