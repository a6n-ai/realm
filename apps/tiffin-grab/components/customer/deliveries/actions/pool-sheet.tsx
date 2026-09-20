"use client";
import { useState } from "react";
import { Button, Notice, Sheet } from "@/components/customer/kit";
import { MakeupSheet } from "./makeup-sheet";
import type { ActionSheetProps } from "./types";

export function PoolSheet(props: ActionSheetProps) {
  const [next, setNext] = useState(false);
  const { trip, plan, open, onDone } = props;
  if (next) return <MakeupSheet {...props} />;
  const n = plan.counts.pooled;
  return (
    <Sheet
      open={open}
      onClose={() => onDone()}
      title="In your pool"
      footer={<Button variant="primary" size="lg" className="w-full" disabledReason={n < 1 ? "Nothing is waiting in your pool." : undefined} onClick={() => setNext(true)}>Schedule a make-up</Button>}
    >
      <div className="space-y-4 pb-2">
        <p className="text-[15px] font-semibold">{n < 1 ? "Nothing is waiting right now." : `${n} ${n === 1 ? "tiffin is" : "tiffins are"} waiting.`}</p>
        <p className="text-[15px] text-[var(--muted-foreground,#6E6558)]">
          When a trip is held or missed, its tiffin goes to your pool. You keep every tiffin you paid for: schedule them on a day after your last delivery.
        </p>
        {trip.pooled && <Notice>This trip is in your pool.</Notice>}
      </div>
    </Sheet>
  );
}
