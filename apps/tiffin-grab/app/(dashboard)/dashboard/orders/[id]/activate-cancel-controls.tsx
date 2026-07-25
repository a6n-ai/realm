"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@realm/ui/button";
import { ResponsiveDialog } from "@/components/ds";
import { activate, cancel } from "./actions";

/** Compact staff-only activate / cancel — vacation/skip live in the shared Deliveries calendar. */
export function ActivateCancelControls({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
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
          <div className="flex justify-end gap-2 px-4 pb-2 md:px-0">
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
        <div className="px-4 md:px-0" />
      </ResponsiveDialog>
    </div>
  );
}
