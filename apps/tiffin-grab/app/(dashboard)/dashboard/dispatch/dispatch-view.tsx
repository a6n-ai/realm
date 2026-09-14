"use client";

import { useMemo, useState, useTransition } from "react";
import { TruckIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { PlanBox } from "@/components/customer/plan-box";
import { reassignDriverAction } from "./actions";
import type { DispatchRow, KnownDriver } from "@/lib/services/optimoroute/drivers";

const UNASSIGNED = "__unassigned__";

// Same numbered-circle language as the deliveries calendar's emerald delivered
// ring — here it marks a stop's position on the route instead of a delivered date.
const STOP_CIRCLE = "ring-2 ring-emerald-500 ring-offset-1 ring-offset-background";

type DriverGroup = {
  key: string;
  driverName: string | null;
  rows: DispatchRow[];
};

function groupByDriver(rows: DispatchRow[]): DriverGroup[] {
  const groups = new Map<string, DriverGroup>();
  for (const row of rows) {
    const key = row.routeDriverSerial ?? UNASSIGNED;
    let group = groups.get(key);
    if (!group) {
      group = { key, driverName: row.routeDriverName, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  for (const group of groups.values()) {
    group.rows.sort((a, b) => (a.routeStopNumber ?? Infinity) - (b.routeStopNumber ?? Infinity));
  }
  // Unassigned last; assigned groups alphabetical by driver name/serial.
  return [...groups.values()].sort((a, b) => {
    if (a.key === UNASSIGNED) return 1;
    if (b.key === UNASSIGNED) return -1;
    return (a.driverName ?? a.key).localeCompare(b.driverName ?? b.key);
  });
}

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
  const [driverBySerial, setDriverBySerial] = useState<Record<string, string | undefined>>(() =>
    Object.fromEntries(rows.map((r) => [r.orderNo, r.routeDriverSerial ?? undefined])),
  );
  const groups = useMemo(() => groupByDriver(rows), [rows]);

  function reassign(orderNo: string, driverSerial: string, revertTo: string | undefined) {
    setErrorFor(null);
    setDriverBySerial((prev) => ({ ...prev, [orderNo]: driverSerial }));
    startTransition(async () => {
      const result = await reassignDriverAction(orderNo, date, driverSerial);
      if (!result.ok) {
        setErrorFor(orderNo);
        setDriverBySerial((prev) => ({ ...prev, [orderNo]: revertTo }));
      }
    });
  }

  if (rows.length === 0) {
    return (
      <div className="grid place-items-center gap-3 rounded-lg border py-12 text-center">
        <span className="bg-muted text-muted-foreground grid size-12 place-items-center rounded-xl">
          <TruckIcon className="size-6" />
        </span>
        <p className="text-muted-foreground max-w-sm px-6">No routes pulled for this date yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <PlanBox key={group.key}>
          {/* items-start + flex-wrap, same as PlanHeadingRow, so a long driver name wraps instead of overlapping the chip */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="min-w-0 font-medium break-words">
              {group.key === UNASSIGNED ? "Unassigned" : group.driverName ?? group.key}
            </p>
            <span className="bg-background/70 text-foreground shrink-0 rounded-full px-2.5 py-1 text-xs font-medium">
              {group.rows.length} stop{group.rows.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-3 divide-y">
            {group.rows.map((r) => (
              // Stacks below sm (640px) instead of squeezing customer name + Select into one row —
              // the compact layout DataTable's mobileCard used to provide.
              <div
                key={r.orderNo}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "bg-muted text-muted-foreground grid size-7 shrink-0 place-items-center rounded-full text-xs font-medium tabular-nums",
                      r.routeStopNumber != null && STOP_CIRCLE,
                    )}
                  >
                    {r.routeStopNumber ?? "—"}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{r.customerName}</p>
                </div>
                <div className="shrink-0 pl-10 sm:pl-0">
                  <Select
                    disabled={pending}
                    value={driverBySerial[r.orderNo]}
                    onValueChange={(v) => reassign(r.orderNo, v, r.routeDriverSerial ?? undefined)}
                  >
                    <SelectTrigger className="h-8 w-full sm:w-40">
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
                </div>
              </div>
            ))}
          </div>
        </PlanBox>
      ))}
    </div>
  );
}
