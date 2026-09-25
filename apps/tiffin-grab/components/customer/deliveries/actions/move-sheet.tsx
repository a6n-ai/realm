"use client";
import { Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { rescheduleMyDelivery } from "@/app/(customer)/me/deliveries/actions";
import { Button, Notice, Reason, Sheet } from "@/components/customer/kit";
import { actionAvailability, humanDate } from "@/lib/deliveries-view";
import { weekdayShort } from "@/lib/deliveries-view/eating";
import { mondayOf } from "@/lib/deliveries-view/week";
import { WeekStrip } from "../week-strip";
import { moveOptions } from "@/lib/deliveries-view/move";
import { formatCoversLabel, movesOneEatDay } from "@/lib/menu/coverage";
import type { ActionSheetProps } from "./types";
import { useCommit } from "./use-commit";

const tiffins = (n: number) => `${n} ${n === 1 ? "tiffin" : "tiffins"}`;

export function MoveSheet({ trip, plan, day: sourceDate, open, onDone }: ActionSheetProps) {
  const [now] = useState(() => Date.now());
  const av = actionAvailability(trip, now, plan.ctx).move;
  // Which eating day is moving: the one the customer selected, or the trip's own date if none was passed.
  const source = sourceDate ?? trip.date;
  const split = movesOneEatDay(trip.coversDates, source);
  const options = useMemo(() => moveOptions(trip, plan.days, now, plan.ctx, plan.today, undefined, source), [trip, plan, now, source]);
  const [picked, setPickedRaw] = useState<string | null>(null);
  const [week, setWeek] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const setPicked = (d: string) => (setReason(null), setPickedRaw(d));
  const byDate = useMemo(() => new Map(options.map((o) => [o.date, o])), [options]);
  const pickable = (iso: string) => { const o = byDate.get(iso); return !!o && !o.disabledReason; };
  const truckDots = useMemo(() => Object.fromEntries(options.filter((o) => !o.disabledReason).map((o) => [o.date, [{ orderId: "x", status: "upcoming" as const, truck: o.carriedOn === o.date }]])), [options]);
  const { pending, error, run } = useCommit(onDone);
  const chosen = options.find((o) => o.date === picked);
  const held = trip.status === "hold";
  const day = humanDate(source);
  const perTiffin = trip.units / Math.max(1, trip.coversDates.length + (trip.extraDates?.length ?? 0));
  const movingUnits = split ? Math.round(perTiffin) || 1 : trip.units;

  const confirm = () => {
    if (!trip.deliveryId || !picked) return;
    void run(
      () => rescheduleMyDelivery(trip.deliveryId!, picked, split ? source : undefined),
      (r) => (r.message === "merged" ? `Moved ${day} to ${humanDate(picked)} and combined with that trip.` : `Moved ${day} to ${humanDate(picked)}.`),
    );
  };

  const footer = (
    <Button
      variant="primary"
      size="lg"
      pending={pending}
      disabledReason={!av.ok ? (av.why ?? undefined) : !chosen ? "Choose a day to continue." : undefined}
      onClick={confirm}
    >
      {chosen ? `Move to ${humanDate(chosen.date)}` : "Move trip"}
    </Button>
  );

  return (
    <Sheet open={open} onClose={() => onDone()} title={`Move ${day}`} footer={footer}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-2">
          {!av.ok ? <Notice>{av.why}</Notice> : (
            <>
              <WeekStrip
                firstWeek={mondayOf(options[0]?.date ?? plan.today)}
                lastWeek={mondayOf(options[options.length - 1]?.date ?? plan.today)}
                week={week ?? mondayOf(options[0]?.date ?? plan.today)}
                today={plan.today}
                selectedDay={picked}
                dots={truckDots}
                colorOf={() => "currentColor"}
                onPickDay={setPicked}
                onWeek={setWeek}
                picker={{ isDisabled: (iso) => !pickable(iso), onDisabledTap: (iso) => setReason(byDate.get(iso)?.disabledReason ?? "That day isn't available.") }}
              />
              {reason && <Reason>{reason}</Reason>}
              {!chosen && <Reason>Choose a day to continue.</Reason>}
              {chosen?.merge ? (
                <Notice>
                  {humanDate(chosen.date)} already has a delivery. Both trips combine into one: {tiffins(chosen.merge.units)} on {humanDate(chosen.date)}. {formatCoversLabel(chosen.merge.covers)}.
                </Notice>
              ) : chosen && chosen.carriedOn !== chosen.date ? (
                <Notice>{humanDate(chosen.date)} will arrive {humanDate(chosen.carriedOn)} with {weekdayShort(chosen.carriedOn)}. We don&apos;t deliver on {weekdayShort(chosen.date)}s, so it rides on the earlier delivery.</Notice>
              ) : chosen ? (
                <Notice>Your {tiffins(movingUnits)} will arrive on {humanDate(chosen.date)}.</Notice>
              ) : null}
              {chosen && (
                <Notice>
                  Only one move is allowed per meal. Once you move it, you can&apos;t move it again, move it back to {humanDate(source)}, or put it on hold.
                </Notice>
              )}
              <Reason>
                Pick the day you want to eat. We choose the delivery day for you (<Truck aria-hidden className="mx-0.5 inline size-3.5 align-[-2px]" /> marks delivery days). {held ? "Uses one of your hold days. " : ""}{split ? "Your other days stay on this trip." : "Days already covered stay with this trip."}
              </Reason>
            </>
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </Sheet>
  );
}
