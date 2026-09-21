"use client";
import { useMemo, useState, useTransition } from "react";
import { Button, DateStrip, Notice, Reason, Sheet } from "@/components/customer/kit";
import { scheduleMyPooledTiffin } from "@/app/(customer)/me/deliveries/actions";
import { isPoolScheduleDateEligible } from "@/app/(customer)/me/deliveries/pool-date-eligibility";
import { carryTripDateIso } from "@/lib/menu/carry-trip";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { humanDate } from "@/lib/deliveries-view";
import type { ActionSheetProps } from "./types";

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const tiffins = (n: number) => `${n} ${n === 1 ? "tiffin" : "tiffins"}`;

export function MakeupSheet({ plan, open, onDone }: ActionSheetProps) {
  const [pending, start] = useTransition();
  const [date, setDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { counts, today } = plan;
  const units = Math.min(counts.pooled, counts.persons || 1);

  const days = useMemo(() => {
    const from = counts.lastDeliveryDate && counts.lastDeliveryDate >= today ? addDays(counts.lastDeliveryDate, 1) : today;
    const out: string[] = [];
    for (let i = 0; out.length < 14 && i < 90; i++) {
      const d = addDays(from, i);
      if (isPoolScheduleDateEligible(d, counts, today)) out.push(d);
    }
    return out.map((d) => ({ date: d }));
  }, [counts, today]);

  const carried = date ? carryTripDateIso(date, counts.deliveryWeekdays as DayOfWeek[]) : null;

  const commit = () =>
    start(async () => {
      setError(null);
      const res = await scheduleMyPooledTiffin(plan.orderId, date!);
      if ("error" in res) return setError(res.error);
      onDone(`Make-up scheduled for ${humanDate(date!)}.`);
    });

  const weekdays = counts.deliveryWeekdays.map((w) => w[0]!.toUpperCase() + w.slice(1)).join(", ");
  return (
    <Sheet
        open={open}
        onClose={() => onDone()}
        title="Schedule a make-up"
        footer={
          <>
            {error && <Notice tone="error" className="mb-3">{error}</Notice>}
            <Button variant="primary" size="lg" className="w-full" pending={pending} disabledReason={counts.pooled < 1 ? "No tiffins waiting in your pool." : !date ? "Choose a day to continue." : undefined} onClick={commit}>
              Schedule make-up
            </Button>
          </>
        }
      >
        {counts.pooled < 1 ? (
          <Notice>No tiffins waiting in your pool.</Notice>
        ) : (
          <div className="space-y-4 pb-2">
            <p className="text-[15px]">
              {tiffins(counts.pooled)} {counts.pooled === 1 ? "is" : "are"} waiting. Pick a day after {counts.lastDeliveryDate ? humanDate(counts.lastDeliveryDate) : "today"} ({weekdays}).
            </p>
            <DateStrip label="Make-up day" days={days} value={date} onChange={setDate} />
            {date && <Reason>{`${humanDate(date)} will arrive carrying ${tiffins(units)}.`}</Reason>}
            {carried && carried !== date && <Notice>We don&apos;t deliver on {humanDate(date!)}. It ships with the {humanDate(carried)} delivery.</Notice>}
          </div>
        )}
      </Sheet>
  );
}
