"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { ResponsiveDialog } from "@/components/ds";
import { humanDate } from "@/lib/deliveries-view";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { projectedEndDate, tripsFor } from "@/lib/orders/bounded-deliveries";
import { activate, cancel, startMigrated } from "./actions";

export type MigrationProjection = {
  frequencyKey: string;
  eatingDays: DayOfWeek[];
  persons: number;
  tiffinCount: number;
  /** Next due date from WordPress's last delivery; prefills the start date. */
  startDate: string;
};

/** Same scheduling the server runs on start, so the preview matches what gets created. */
function endFor(m: MigrationProjection, startDate: string): string | null {
  if (!startDate) return null;
  try {
    return projectedEndDate({ startDate, trips: tripsFor(m.frequencyKey, m.eatingDays), persons: m.persons, targetTiffinCount: m.tiffinCount });
  } catch {
    return null;
  }
}

/** Compact staff-only activate / cancel. Per-day changes (move, swap, address) live in the Deliveries tab. */
export function ActivateCancelControls({
  orderId,
  status,
  migrated = false,
  migration = null,
}: {
  orderId: string;
  status: string;
  migrated?: boolean;
  migration?: MigrationProjection | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [startDate, setStartDate] = useState(migration?.startDate ?? "");
  const end = migration ? endFor(migration, startDate) : null;
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  if (status === "cancelled") return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "waitlisted" && (
        <Button size="sm" disabled={pending} onClick={() => run(() => activate(orderId))}>
          Activate
        </Button>
      )}
      {status === "pending" && migrated && (
        <ResponsiveDialog
          open={startOpen}
          onOpenChange={setStartOpen}
          trigger={<Button size="sm" disabled={pending}>Start migrated plan</Button>}
          title="Start this plan here"
          description="Schedules the tiffins left from WordPress, starting on this date. Stop the customer on WordPress the same day so they don't get two deliveries."
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStartOpen(false)}>
                Not yet
              </Button>
              <Button
                disabled={pending || !startDate}
                onClick={() =>
                  start(async () => {
                    const res = await startMigrated(orderId, startDate);
                    if ("error" in res) {
                      toast.error(res.error);
                      return;
                    }
                    setStartOpen(false);
                    toast.success("Plan started");
                    router.refresh();
                  })
                }
              >
                Start plan
              </Button>
            </div>
          }
        >
          <div className="space-y-2">
            <Input type="date" aria-label="First delivery date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            {migration && (
              <p className="text-muted-foreground text-sm">
                {migration.tiffinCount} tiffins{end ? `, last delivery ${humanDate(end)}` : ""}
              </p>
            )}
          </div>
        </ResponsiveDialog>
      )}
      <ResponsiveDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        trigger={
          <Button size="sm" variant="destructive" disabled={pending}>
            Cancel order
          </Button>
        }
        title="Cancel this order?"
        description="This cancels the subscription and all its scheduled deliveries. This cannot be undone."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>
              Keep order
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setConfirmCancel(false);
                run(() => cancel(orderId));
              }}
            >
              Cancel order
            </Button>
          </div>
        }
      >
        <div />
      </ResponsiveDialog>
    </div>
  );
}
