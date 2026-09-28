"use client";

import { useState, useTransition } from "react";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { humanDate } from "@/lib/deliveries-view";
import { pushDeliveryToOptimoAction, removeDeliveryFromOptimoAction } from "./actions";

export type OptimoRouteRow = {
  publicId: string;
  deliveryDate: string;
  status: string;
  routeDriverName: string | null;
  routeSyncedAt: number | null;
};

/**
 * Manual per-delivery push/remove — the fallback for when a scheduled push went wrong or the
 * data was stale, without waiting on the day's full pushDay run or the next cron pull.
 */
export function OptimoRoutePanel({ orderId, rows }: { orderId: string; rows: OptimoRouteRow[] }) {
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

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No upcoming deliveries.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Delivery</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Route</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.publicId} data-date={row.deliveryDate}>
              <TableCell className="font-medium whitespace-nowrap">{humanDate(row.deliveryDate)}</TableCell>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
