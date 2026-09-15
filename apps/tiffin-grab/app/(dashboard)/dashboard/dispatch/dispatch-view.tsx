"use client";

import { useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { TruckIcon } from "lucide-react";
import { TableCell } from "@foundry/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@foundry/ui/select";
import { Button } from "@foundry/ui/button";
import {
  DataTable,
  DEFAULT_SIZE,
  PAGE_SIZES,
  ResponsiveDialog,
  type Column,
} from "@/components/ds";
import {
  pushDeliveryAction,
  removeDeliveryAction,
  reassignDriverAction,
} from "./actions";
import type {
  DispatchRow,
  KnownDriver,
} from "@/lib/services/optimoroute/drivers";

const UNASSIGNED = "__unassigned__";

function dispatchPagination(sp: URLSearchParams) {
  const page = Math.max(0, Number.parseInt(sp.get("page") ?? "0", 10) || 0);
  const rawSize = Number.parseInt(sp.get("size") ?? String(DEFAULT_SIZE), 10);
  const size = (PAGE_SIZES as readonly number[]).includes(rawSize)
    ? rawSize
    : DEFAULT_SIZE;
  return { page, size };
}

// Same unassigned-last, driver-alphabetical, stop-ascending order the old
// per-driver grouping produced — just a flat sort instead of a grouping step.
function sortRows(rows: DispatchRow[]): DispatchRow[] {
  return [...rows].sort((a, b) => {
    const aKey = a.routeDriverSerial ?? UNASSIGNED;
    const bKey = b.routeDriverSerial ?? UNASSIGNED;
    if (aKey === UNASSIGNED && bKey !== UNASSIGNED) return 1;
    if (bKey === UNASSIGNED && aKey !== UNASSIGNED) return -1;
    const nameCompare = (a.routeDriverName ?? aKey).localeCompare(
      b.routeDriverName ?? bKey,
    );
    if (nameCompare !== 0) return nameCompare;
    return (a.routeStopNumber ?? Infinity) - (b.routeStopNumber ?? Infinity);
  });
}

const COLUMNS: readonly Column<"customer" | "driver" | "stop" | "actions">[] = [
  { key: "customer", label: "Customer" },
  { key: "driver", label: "Driver" },
  { key: "stop", label: "Stop #", align: "right" },
  { key: "actions", label: "" },
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
  const params = useSearchParams();
  const { page, size } = dispatchPagination(params);
  const [pending, startTransition] = useTransition();
  const [errorFor, setErrorFor] = useState<{
    orderNo: string;
    message: string;
  } | null>(null);
  const [driverBySerial, setDriverBySerial] = useState<
    Record<string, string | undefined>
  >(() =>
    Object.fromEntries(
      rows.map((r) => [r.orderNo, r.routeDriverSerial ?? undefined]),
    ),
  );
  // Removing a stop takes a driver off that customer's door — a single misclick shouldn't
  // do that, same reasoning RemoveControl's dialog uses for the bulk day-level removal.
  const [confirmRemove, setConfirmRemove] = useState<DispatchRow | null>(null);

  const sorted = useMemo(() => sortRows(rows), [rows]);

  function reassign(
    orderNo: string,
    driverSerial: string,
    revertTo: string | undefined,
  ) {
    setErrorFor(null);
    setDriverBySerial((prev) => ({ ...prev, [orderNo]: driverSerial }));
    startTransition(async () => {
      const result = await reassignDriverAction(orderNo, date, driverSerial);
      if (!result.ok) {
        setErrorFor({ orderNo, message: result.message });
        setDriverBySerial((prev) => ({ ...prev, [orderNo]: revertTo }));
      }
    });
  }

  function push(orderNo: string) {
    setErrorFor(null);
    startTransition(async () => {
      const result = await pushDeliveryAction(orderNo, date);
      if (!result.ok) setErrorFor({ orderNo, message: result.message });
    });
  }

  function remove(orderNo: string) {
    setErrorFor(null);
    setConfirmRemove(null);
    startTransition(async () => {
      const result = await removeDeliveryAction(orderNo, date);
      if (!result.ok) setErrorFor({ orderNo, message: result.message });
    });
  }

  return (
    <>
      <DataTable
        columns={COLUMNS}
        rows={sorted}
        rowKey={(r) => r.orderNo}
        serial={false}
        pagination={{ page, size }}
        search={{ placeholder: "Search customer or driver…", keys: ["customerName", "routeDriverName"] }}
        emptyIcon={TruckIcon}
        emptyMessage="No deliveries scheduled for this date."
        renderRow={(r) => (
          <>
            <TableCell className="font-medium">{r.customerName}</TableCell>
            <TableCell>
              <Select
                disabled={pending}
                value={driverBySerial[r.orderNo]}
                onValueChange={(v) =>
                  reassign(r.orderNo, v, r.routeDriverSerial ?? undefined)
                }
              >
                <SelectTrigger className="h-8 w-40">
                  <SelectValue
                    placeholder={r.routeDriverName ?? "Unassigned"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((d) => (
                    <SelectItem key={d.driverSerial} value={d.driverSerial}>
                      {d.driverName ?? d.driverSerial}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.routeStopNumber ?? "—"}
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => push(r.orderNo)}
                >
                  Push
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || r.routeSyncedAt == null}
                  onClick={() => setConfirmRemove(r)}
                >
                  Remove
                </Button>
              </div>
              {errorFor?.orderNo === r.orderNo ? (
                <p className="text-destructive mt-1 text-right text-xs">
                  {errorFor.message}
                </p>
              ) : null}
            </TableCell>
          </>
        )}
        mobileCard={(r) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{r.customerName}</p>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {r.routeStopNumber ?? "—"}
              </span>
            </div>
            <Select
              disabled={pending}
              value={driverBySerial[r.orderNo]}
              onValueChange={(v) =>
                reassign(r.orderNo, v, r.routeDriverSerial ?? undefined)
              }
            >
              <SelectTrigger className="h-8 w-full">
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
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={pending}
                onClick={() => push(r.orderNo)}
              >
                Push
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={pending || r.routeSyncedAt == null}
                onClick={() => setConfirmRemove(r)}
              >
                Remove
              </Button>
            </div>
            {errorFor?.orderNo === r.orderNo ? (
              <p className="text-destructive text-xs">{errorFor.message}</p>
            ) : null}
          </div>
        )}
      />
      <ResponsiveDialog
        open={confirmRemove != null}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
        title="Remove this stop?"
        description={
          confirmRemove
            ? `${confirmRemove.customerName} will be deleted from OptimoRoute for ${date}. The driver will no longer be routed to them.`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmRemove(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => confirmRemove && remove(confirmRemove.orderNo)}
            >
              Remove
            </Button>
          </div>
        }
      >
        {null}
      </ResponsiveDialog>
    </>
  );
}
