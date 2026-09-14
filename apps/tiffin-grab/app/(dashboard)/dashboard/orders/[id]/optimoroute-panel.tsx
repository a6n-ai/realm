"use client";

import { useState, useTransition } from "react";
import { Button } from "@foundry/ui/button";
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
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.publicId} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
          <div className="min-w-0">
            <p className="text-sm font-medium">{row.deliveryDate}</p>
            <p className="text-muted-foreground text-xs">
              {row.routeDriverName ?? (row.routeSyncedAt ? "Synced, unassigned" : "Not synced")}
            </p>
            {errorFor === row.publicId ? (
              <p className="text-destructive text-xs">Action failed — try again.</p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
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
        </div>
      ))}
    </div>
  );
}
