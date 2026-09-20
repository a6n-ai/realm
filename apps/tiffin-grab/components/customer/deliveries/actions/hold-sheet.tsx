"use client";
import { useState } from "react";
import { skipMyDelivery, unskipMyDelivery } from "@/app/(customer)/me/deliveries/actions";
import { Button, Card, Notice, Reason, Sheet } from "@/components/customer/kit";
import { actionAvailability, formatCutoff, humanDate } from "@/lib/deliveries-view";
import { formatMissedDays } from "@/lib/menu/coverage";
import type { ActionSheetProps } from "./types";
import { useCommit } from "./use-commit";

const tiffins = (n: number) => `${n} ${n === 1 ? "tiffin" : "tiffins"}`;

export function HoldSheet({ trip, plan, open, onDone }: ActionSheetProps) {
  const resume = trip.status === "hold" || trip.status === "rescheduled";
  const [now] = useState(() => Date.now());
  const av = actionAvailability(trip, now, plan.ctx)[resume ? "resume" : "hold"];
  const { pending, error, run } = useCommit(onDone);
  const day = humanDate(trip.date);
  const until = formatCutoff(trip.cutoffAt, plan.ctx.timezone);
  const holdDays = plan.counts.holdDays;

  const confirm = () => {
    if (!trip.deliveryId) return;
    if (resume) return run(() => unskipMyDelivery(trip.deliveryId!), () => `Resumed ${day}. It's back on your schedule.`);
    return run(
      () => skipMyDelivery(trip.deliveryId!),
      () => `Held ${day}. You can resume until ${until}. After that, ${formatMissedDays(trip.coversDates)} ${trip.units === 1 ? "tiffin goes" : "tiffins go"} to your pool.`,
    );
  };

  const footer = (
    <div className="grid gap-2">
      <Button variant="primary" size="lg" pending={pending} disabledReason={av.ok ? undefined : (av.why ?? undefined)} onClick={confirm}>
        {resume ? "Resume trip" : "Hold this trip"}
      </Button>
      <Button variant="quiet" size="lg" onClick={() => onDone()}>{resume ? "Keep it on hold" : "Keep delivery"}</Button>
    </div>
  );

  return (
    <Sheet open={open} onClose={() => onDone()} title={resume ? `Resume ${day}` : `Hold ${day}`} footer={footer}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-2">
          {!av.ok && <Notice>{av.why}</Notice>}
          <Card className="grid gap-2 p-4">
            {resume ? (
              <>
                <p className="text-[15px] font-semibold">{tiffins(trip.units)} back on your schedule</p>
                <p className="text-sm text-[var(--muted-foreground,#6E6558)]">This trip goes back on {day} and the hold day is returned{holdDays > 0 ? `: hold days ${holdDays} → ${holdDays - 1}` : ""}.</p>
              </>
            ) : (
              <>
                <p className="text-[15px] font-semibold">{tiffins(trip.units)} won&apos;t be delivered on {day}</p>
                <p className="text-sm text-[var(--muted-foreground,#6E6558)]">You keep {trip.units === 1 ? "it" : "them"}: added after your last delivery, or moved to a day you pick. Hold days {holdDays} → {holdDays + 1}. Tiffins left stay the same.</p>
                {trip.coversDates.length > 1 && <p className="text-sm">This trip carries {formatMissedDays(trip.coversDates)}. All of them are held.</p>}
              </>
            )}
          </Card>
          <Reason>{resume ? `You can resume any time until ${until}.` : `Free until ${until}. After that this trip is locked.`}</Reason>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </Sheet>
  );
}
