"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@realm/ui/button";
import { ResponsiveDialog } from "@/components/ds";
import { activate, cancel, pause, resume } from "./actions";

export function LifecycleControls({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [resumeFrom, setResumeFrom] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const run = (fn: () => Promise<void>) => start(async () => { await fn(); router.refresh(); });

  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === "waitlisted" && (
        <Button disabled={pending} onClick={() => run(() => activate(orderId))}>Activate</Button>
      )}
      {status === "active" && (
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border bg-transparent px-2 py-1 text-sm" />
          <span className="text-muted-foreground text-sm">to</span>
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="rounded-md border bg-transparent px-2 py-1 text-sm" />
          <Button variant="secondary" disabled={pending || !from || !until} onClick={() => run(() => pause(orderId, { from, until }))}>Pause</Button>
        </div>
      )}
      {status === "paused" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">Resume from (optional)</span>
          <input
            type="date"
            value={resumeFrom}
            onChange={(e) => setResumeFrom(e.target.value)}
            className="rounded-md border bg-transparent px-2 py-1 text-sm"
          />
          <Button disabled={pending} onClick={() => run(() => resume(orderId, resumeFrom || undefined))}>
            {resumeFrom ? "Resume from date" : "Resume"}
          </Button>
        </div>
      )}
      {status !== "cancelled" && (
        <ResponsiveDialog
          open={confirmCancel}
          onOpenChange={setConfirmCancel}
          trigger={<Button variant="destructive" disabled={pending}>Cancel</Button>}
          title="Cancel this order?"
          description="This cancels the subscription and all its scheduled deliveries. This cannot be undone."
          footer={
            <div className="flex justify-end gap-2 px-4 pb-2 md:px-0">
              <Button variant="outline" onClick={() => setConfirmCancel(false)}>Keep order</Button>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => { setConfirmCancel(false); run(() => cancel(orderId)); }}
              >
                Cancel order
              </Button>
            </div>
          }
        >
          <div className="px-4 md:px-0" />
        </ResponsiveDialog>
      )}
    </div>
  );
}
