"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { activate, cancel, pause, resume } from "./actions";

export function LifecycleControls({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
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
        <Button disabled={pending} onClick={() => run(() => resume(orderId))}>Resume</Button>
      )}
      {status !== "cancelled" && (
        <Button variant="destructive" disabled={pending} onClick={() => run(() => cancel(orderId))}>Cancel</Button>
      )}
    </div>
  );
}
