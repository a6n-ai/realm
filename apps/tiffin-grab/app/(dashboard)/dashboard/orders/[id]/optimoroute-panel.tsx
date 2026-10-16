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
 * Manual push/remove for one delivery — the fallback for when a scheduled push went wrong or the
 * data was stale, without waiting on the day's full pushDay run or the next cron pull.
 */
export function RouteControls({ orderId, row }: { orderId: string; row: OptimoRouteRow }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function run(action: (orderId: string, deliveryPublicId: string, date: string) => Promise<void>) {
    setFailed(false);
    startTransition(async () => {
      try {
        await action(orderId, row.publicId, row.deliveryDate);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2" data-testid="route-controls" data-date={row.deliveryDate}>
      <p className="text-muted-foreground text-sm">
        {row.routeDriverName ?? (row.routeSyncedAt ? "Synced, unassigned" : "Not synced")}
        {failed ? <span className="text-destructive block text-xs" role="alert">Action failed. Try again.</span> : null}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(pushDeliveryToOptimoAction)}>
          Push
        </Button>
        <Button size="sm" variant="outline" disabled={pending || row.routeSyncedAt == null} onClick={() => run(removeDeliveryFromOptimoAction)}>
          Remove
        </Button>
      </div>
    </div>
  );
}
