"use client";
import { Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { rescheduleMyDelivery } from "@/app/(customer)/me/deliveries/actions";
import { actionAvailability, humanDate } from "@/lib/deliveries-view";
import { weekdayShort } from "@/lib/deliveries-view/eating";
import { dotStatus, mondayOf } from "@/lib/deliveries-view/week";
import { moveLockReason, moveOptions, planEndDate } from "@/lib/deliveries-view/move";
import type { StripDot } from "../week-strip";
import { formatCoversLabel } from "@/lib/menu/coverage";
import type { ActionSheetProps } from "./types";
import { useCommit } from "./use-commit";
import { useSheetUi } from "./sheet-ui";

const tiffins = (n: number) => `${n} ${n === 1 ? "tiffin" : "tiffins"}`;

export function MoveSheet({ trip, plan, agenda, day: sourceDate, open, onDone, ui }: ActionSheetProps) {
  const { Shell, PrimaryButton, Notice, Reason, WeekStrip, PillToggle } = useSheetUi(ui);
  const [now] = useState(() => Date.now());
  // Which eating day is moving: the one the customer selected, or the trip's own date if none was passed.
  const source = sourceDate ?? trip.date;
  const lock = moveLockReason(trip, source);
  const av = lock ? { ok: false, why: lock, sub: "" } : actionAvailability(trip, now, plan.ctx).move;
  const split = trip.coversDates.length + (trip.extraDates?.length ?? 0) > 1;
  const options = useMemo(() => moveOptions(trip, plan.days, now, plan.ctx, plan.today, undefined, source), [trip, plan, now, source]);
  const [picked, setPickedRaw] = useState<string | null>(null);
  const [week, setWeek] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const setPicked = (d: string) => (setReason(null), setPickedRaw(d));
  const byDate = useMemo(() => new Map(options.map((o) => [o.date, o])), [options]);
  const pickable = (iso: string) => { const o = byDate.get(iso); return !!o && !o.disabledReason; };
  // Same dots and icons as the main calendar, plus a truck on every pickable delivery day that has no trip yet.
  const dots = useMemo(() => {
    const out: Record<string, StripDot[]> = {};
    for (const [date, ds] of Object.entries(agenda ?? {})) out[date] = ds.map((d) => ({ orderId: d.orderId, status: dotStatus(d, now), truck: d.truck }));
    for (const o of options) if (!o.disabledReason && o.carriedOn === o.date && !out[o.date]?.some((x) => x.truck)) (out[o.date] ??= []).push({ orderId: "x", truck: true });
    return out;
  }, [agenda, options, now]);
  const end = planEndDate(plan.ctx);
  const endOption = end ? byDate.get(end) : undefined;
  const toEnd = () => {
    if (!end || !endOption) return setReason("This plan has no end date to move to.");
    if (endOption.disabledReason) return setReason(endOption.disabledReason);
    setPicked(end);
    setWeek(mondayOf(end));
  };
  const { pending, error, run } = useCommit(onDone);
  const chosen = options.find((o) => o.date === picked);
  const day = humanDate(source);
  const perTiffin = trip.units / Math.max(1, trip.coversDates.length + (trip.extraDates?.length ?? 0));
  const movingUnits = split ? Math.round(perTiffin) || 1 : trip.units;

  const confirm = () => {
    if (!trip.deliveryId || !picked) return;
    void run(
      () => rescheduleMyDelivery(trip.deliveryId!, picked, source),
      () => `Moved ${day} to ${humanDate(picked)}.`,
    );
  };

  const footer = (
    <PrimaryButton
      pending={pending}
      disabledReason={!av.ok ? (av.why ?? undefined) : !chosen ? "Choose a day to continue." : undefined}
      onClick={confirm}
    >
      {chosen ? `Move to ${humanDate(chosen.date)}` : "Move trip"}
    </PrimaryButton>
  );

  return (
    <Shell open={open} onClose={() => onDone()} title={`Move ${day}`} footer={footer}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-2">
          {!av.ok ? <Notice>{av.why}</Notice> : (
            <>
              {end && (
                <PillToggle on={picked === end} onClick={toEnd} className="justify-self-start">
                  Move to end of plan ({humanDate(end)})
                </PillToggle>
              )}
              <WeekStrip
                firstWeek={mondayOf(options[0]?.date ?? plan.today)}
                lastWeek={mondayOf(options[options.length - 1]?.date ?? plan.today)}
                week={week ?? mondayOf(options[0]?.date ?? plan.today)}
                today={plan.today}
                selectedDay={picked}
                dots={dots}
                colorOf={() => "currentColor"}
                onPickDay={setPicked}
                onWeek={setWeek}
                picker={{ isDisabled: (iso) => !pickable(iso), onDisabledTap: (iso) => setReason(byDate.get(iso)?.disabledReason ?? "That day isn't available.") }}
              />
              {reason && <Reason>{reason}</Reason>}
              {!chosen && <Reason>Choose a day to continue.</Reason>}
              {chosen?.merge ? (
                <Notice>
                  It rides the {humanDate(chosen.carriedOn)} delivery: {tiffins(chosen.merge.units)} on that truck.{formatCoversLabel(chosen.merge.covers) && ` ${formatCoversLabel(chosen.merge.covers)}.`}
                </Notice>
              ) : chosen && chosen.carriedOn !== chosen.date ? (
                <Notice>{humanDate(chosen.date)} will arrive {humanDate(chosen.carriedOn)} with {weekdayShort(chosen.carriedOn)}. We don&apos;t deliver on {weekdayShort(chosen.date)}s, so it rides on the earlier delivery.</Notice>
              ) : chosen ? (
                <Notice>Your {tiffins(movingUnits)} will arrive on {humanDate(chosen.date)}.</Notice>
              ) : null}
              {chosen && (
                <Notice>
                  It becomes {weekdayShort(chosen.date)}&apos;s tiffin, with {weekdayShort(chosen.date)}&apos;s menu. Any meal you pick for {weekdayShort(chosen.date)} applies to it too. Only one move is allowed per meal. Once you move it, you can&apos;t move it again, move it back to {humanDate(source)}, or put it on hold.
                </Notice>
              )}
              <Reason>
                Pick the day you want to eat. We choose the delivery day for you (<Truck aria-hidden className="mx-0.5 inline size-3.5 align-[-2px]" /> marks delivery days). {split ? "Your other days stay on this trip." : "Days already covered stay with this trip."}
              </Reason>
            </>
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </Shell>
  );
}
