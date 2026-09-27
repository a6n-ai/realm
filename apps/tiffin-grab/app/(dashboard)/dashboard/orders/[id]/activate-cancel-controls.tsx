"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { ResponsiveDialog } from "@/components/ds";
import { activate, cancel, startMigrated } from "./actions";

/** Compact staff-only activate / cancel — vacation/skip live in the shared Deliveries calendar. */
export function ActivateCancelControls({ orderId, status, migrated = false }: { orderId: string; status: string; migrated?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
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
          <Input type="date" aria-label="First delivery date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
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
