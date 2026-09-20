"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, Card, Chip, Notice, Reason, Sheet } from "@/components/customer/kit";
import { actionAvailability, formatCutoff, humanDate } from "@/lib/deliveries-view";
import type { ActionSheetProps } from "./types";

export function PickSheet({ trip, plan, open, onDone }: ActionSheetProps) {
  const [going, setGoing] = useState(false);
  const av = actionAvailability(trip, Date.now(), plan.ctx).pick;
  const closed = Date.now() >= trip.cutoffAt;
  const reason = !av.ok ? av.why : closed ? `Changes closed ${formatCutoff(trip.cutoffAt, plan.ctx.timezone)}. This trip is being prepared.` : null;
  const n = trip.eatingDays.length;

  return (
    <Sheet
      open={open}
      onClose={() => onDone()}
      title="Pick meals"
      footer={
        reason ? undefined : (
          <Link href={`/me/meals?date=${trip.date}`} className="block" onClick={() => setGoing(true)}>
            <Button variant="primary" size="lg" className="w-full" pending={going}>
              Choose meals
            </Button>
          </Link>
        )
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        {reason ? (
          <Notice>{reason}</Notice>
        ) : (
          <Reason>
            {n > 1 ? `One trip, ${n} eating days. Each day has its own picks. ` : ""}Closes {formatCutoff(trip.cutoffAt, plan.ctx.timezone)}.
          </Reason>
        )}
        {trip.eatingDays.map((e) => (
          <Card key={e.date} className="flex flex-col gap-1.5 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[15px] font-semibold">{humanDate(e.date)}</h3>
              {e.dishSummary ? null : <Chip>Default menu</Chip>}
            </div>
            {e.dishSummary ? <p className="text-sm">{e.dishSummary}</p> : <p className="text-sm text-[var(--muted-foreground,#6E6558)]">Menu not released yet, or nothing picked. We&apos;ll use the default menu.</p>}
            {e.locksWith && <p className="text-[13px] text-[var(--muted-foreground,#6E6558)]">Locks with {humanDate(e.locksWith)}&apos;s delivery</p>}
          </Card>
        ))}
      </div>
    </Sheet>
  );
}
