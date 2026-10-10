"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { ChevronLeft, ChevronRight, TruckIcon } from "lucide-react";
import { TableCell } from "@foundry/ui/table";
import { DataTable, type Column } from "@/components/ds";
import { humanDate } from "@/lib/deliveries-view";
import { addDays } from "@/lib/deliveries-view/week";
import { pushDeliveryToOptimoAction, removeDeliveryFromOptimoAction } from "./actions";

export type OptimoRouteRow = {
  publicId: string;
  deliveryDate: string;
  status: string;
  routeDriverName: string | null;
  routeSyncedAt: number | null;
};

const COLUMNS: readonly Column<"date" | "id" | "status" | "route" | "actions">[] = [
  { key: "date", label: "Delivery" },
  { key: "id", label: "Delivery ID", width: "w-44" },
  { key: "status", label: "Status" },
  { key: "route", label: "Route" },
  // The fixed-layout table clips overflow, so size the column for both buttons.
  { key: "actions", label: "Actions", align: "right", width: "w-48" },
];

/**
 * Manual per-delivery push/remove — the fallback for when a scheduled push went wrong or the
 * data was stale, without waiting on the day's full pushDay run or the next cron pull.
 */
export function OptimoRoutePanel({ orderId, rows, week }: {
  orderId: string;
  rows: OptimoRouteRow[];
  /** The Deliveries tab's selected week (Monday ISO) and the plan's bounds; null shows every row. */
  week: { start: string; first: string; last: string } | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [nav, startNav] = useTransition();
  const [pending, startTransition] = useTransition();
  const [errorFor, setErrorFor] = useState<string | null>(null);

  function run(action: (deliveryPublicId: string, date: string) => Promise<void>, row: OptimoRouteRow) {
    setErrorFor(null);
    startTransition(async () => {
      try {
        await action(row.publicId, row.deliveryDate);
      } catch {
        setErrorFor(row.publicId);
      }
    });
  }

  const end = week ? addDays(week.start, 6) : null;
  const shown = week ? rows.filter((r) => r.deliveryDate >= week.start && r.deliveryDate <= end!) : rows;
  // Same ?week the timeline and eating-days table use, so all three stay on one week.
  const goWeek = (monday: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("week", monday);
    sp.delete("trip");
    startNav(() => router.replace(`?${sp.toString()}`, { scroll: false }));
  };

  return (
    <div className={nav ? "space-y-3 opacity-60 transition-opacity" : "space-y-3"}>
      {week && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">{humanDate(week.start)} – {humanDate(end!)}</p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" disabled={week.start <= week.first} onClick={() => goWeek(addDays(week.start, -7))}><ChevronLeft data-icon="inline-start" />Previous</Button>
            <Button variant="outline" size="sm" disabled={week.start >= week.last} onClick={() => goWeek(addDays(week.start, 7))}>Next<ChevronRight data-icon="inline-end" /></Button>
          </div>
        </div>
      )}
      <DataTable
        pagination="client"
        columns={COLUMNS}
        rows={shown}
        rowKey={(r) => r.publicId}
        serial={false}
        emptyIcon={TruckIcon}
        emptyMessage={week ? "No upcoming deliveries this week." : "No upcoming deliveries."}
        renderRow={(row) => (
          <>
            <TableCell className="font-medium whitespace-nowrap">{humanDate(row.deliveryDate)}</TableCell>
            <TableCell className="font-mono text-xs">{row.publicId}</TableCell>
            <TableCell><Badge variant="outline" className="capitalize">{row.status}</Badge></TableCell>
            <TableCell className="text-muted-foreground">
              {row.routeDriverName ?? (row.routeSyncedAt ? "Synced, unassigned" : "Not synced")}
              {errorFor === row.publicId ? <span className="text-destructive block text-xs">Action failed. Try again.</span> : null}
            </TableCell>
            <TableCell className="text-right">
              <div className="inline-flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run((id, date) => pushDeliveryToOptimoAction(orderId, id, date), row)}
                >
                  Push
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || row.routeSyncedAt == null}
                  onClick={() => run((id, date) => removeDeliveryFromOptimoAction(orderId, id, date), row)}
                >
                  Remove
                </Button>
              </div>
            </TableCell>
          </>
        )}
      />
    </div>
  );
}
