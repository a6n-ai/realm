"use client";
import { CalendarCheck, Package, Truck, Utensils, type LucideIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { rescheduleMyDelivery } from "@/app/(customer)/me/deliveries/actions";
import { actionAvailability, humanDate } from "@/lib/deliveries-view";
import { weekdayShort } from "@/lib/deliveries-view/eating";
import { mondayOf } from "@/lib/deliveries-view/week";
import { moveOptions, planEndDate, tripCounts } from "@/lib/deliveries-view/move";
import { WeekTimeline } from "../week-timeline";
import type { ActionSheetProps } from "./types";
import { useCommit } from "./use-commit";
import { useSheetUi } from "./sheet-ui";

const tiffins = (n: number) => `${n} ${n === 1 ? "tiffin" : "tiffins"}`;

// Plain spans on theme tokens, so the admin (shadcn) and kit sheets both render them.
const Pill = ({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) => (
  <li className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1 text-[13px] font-medium">
    <Icon aria-hidden className="size-3.5 shrink-0" />
    {children}
  </li>
);

export function MoveSheet({ trip, plan, agenda, day: sourceDate, open, onDone, ui }: ActionSheetProps) {
  const { Shell, PrimaryButton, Notice, Reason, OptionCard } = useSheetUi(ui);
  const [now] = useState(() => Date.now());
  // Which eating day is moving: the one the customer selected, or the trip's own date if none was passed.
  const source = sourceDate ?? trip.date;
  const av = actionAvailability(trip, now, plan.ctx).move;
  const split = trip.coversDates.length + (trip.extraDates?.length ?? 0) > 1;
  // A day can hold several tiffins once others moved onto it: ask how many go.
  const onDay = tripCounts(trip).get(source) ?? 1;
  const [qty, setQty] = useState(1);
  const options = useMemo(() => moveOptions(trip, plan.days, now, plan.ctx, plan.today, undefined, source, qty), [trip, plan, now, source, qty]);
  const [picked, setPickedRaw] = useState<string | null>(null);
  const [week, setWeek] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const setPicked = (d: string) => (setReason(null), setPickedRaw(d));
  const byDate = useMemo(() => new Map(options.map((o) => [o.date, o])), [options]);
  const pickable = (iso: string) => { const o = byDate.get(iso); return !!o && !o.disabledReason; };
  const end = planEndDate(plan.ctx);
  const endOption = end ? byDate.get(end) : undefined;
  const toEnd = () => {
    if (!end || !endOption) return setReason("This plan has no end date to move to.");
    if (endOption.disabledReason) return setReason(endOption.disabledReason);
    setPicked(end);
    setWeek(mondayOf(end));
  };
  // First day the next plan delivers inside this sheet's range: those days are greyed, so say why up front.
  const renewalFrom = options.find((o) => plan.ctx.otherPlanDays?.[o.carriedOn] === "renewal")?.carriedOn;
  const { pending, error, run } = useCommit(onDone);
  const chosen = options.find((o) => o.date === picked);
  const day = humanDate(source);
  const perTiffin = trip.units / Math.max(1, trip.coversDates.length + (trip.extraDates?.length ?? 0));
  const movingUnits = split ? Math.round(perTiffin * qty) || 1 : trip.units;

  const confirm = () => {
    if (!trip.deliveryId || !picked) return;
    void run(
      () => rescheduleMyDelivery(trip.deliveryId!, picked, source, qty),
      () => `Moved ${day} to ${humanDate(picked)}.`,
    );
  };

  const footer = (
    <PrimaryButton
      pending={pending}
      disabledReason={!av.ok ? (av.why ?? undefined) : !chosen ? "Choose a day." : undefined}
      onClick={confirm}
    >
      {chosen ? `Move to ${humanDate(chosen.date)}` : "Move"}
    </PrimaryButton>
  );

  return (
    <Shell open={open} onClose={() => onDone()} title={`Move ${day}`} footer={footer}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-2">
          {!av.ok ? <Notice>{av.why}</Notice> : (
            <>
              {onDay > 1 && (
                <div role="group" aria-label="How many tiffins to move" className="flex flex-col gap-2">
                  <span className="text-[15px] font-semibold">How many tiffins to move</span>
                  <div className="flex gap-2">
                    {Array.from({ length: onDay }, (_, i) => i + 1).map((n) => (
                      <OptionCard key={n} aria-label={tiffins(Math.round(perTiffin * n) || n)} selected={qty === n} onClick={() => (setReason(null), setQty(n))} className="flex min-h-11 flex-1 items-center justify-center text-[17px] font-semibold tabular-nums">
                        {Math.round(perTiffin * n) || n}
                      </OptionCard>
                    ))}
                  </div>
                </div>
              )}
              {end && (
                <OptionCard selected={picked === end} onClick={toEnd} className="flex w-full items-center gap-3 px-4 py-3">
                  <CalendarCheck aria-hidden className="size-5 shrink-0 text-[var(--primary)]" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[15px] font-semibold">Move to end of plan</span>
                    <span className="text-[13px] text-[var(--muted-foreground,#6E6558)]">{humanDate(end)}</span>
                  </span>
                </OptionCard>
              )}
              {renewalFrom && <Reason>Renewal starts {humanDate(renewalFrom)}. Its days are greyed out.</Reason>}
              <WeekTimeline
                firstWeek={mondayOf(options[0]?.date ?? plan.today)}
                lastWeek={mondayOf(options[options.length - 1]?.date ?? plan.today)}
                week={week ?? mondayOf(options[0]?.date ?? plan.today)}
                today={plan.today}
                selectedDay={picked}
                agenda={agenda ?? {}}
                now={now}
                onPickDay={setPicked}
                onWeek={setWeek}
                isDisabled={(iso) => !pickable(iso)}
                onDisabledTap={(iso) => setReason(byDate.get(iso)?.disabledReason ?? "That day isn't available.")}
                deliveryDay={(iso) => !!agenda?.[iso]?.some((x) => x.truck) || (!!byDate.get(iso) && !byDate.get(iso)!.disabledReason && byDate.get(iso)!.carriedOn === iso)}
              />
              {reason && <Reason>{reason}</Reason>}
              {chosen ? (
                <ul aria-label="What happens" className="flex flex-wrap gap-2">
                  <Pill icon={Truck}>Arrives {humanDate(chosen.carriedOn)}</Pill>
                  <Pill icon={Package}>{tiffins(chosen.merge ? chosen.merge.units : movingUnits)} that day</Pill>
                  <Pill icon={Utensils}>{weekdayShort(chosen.date)}&apos;s menu</Pill>
                </ul>
              ) : !reason && <Reason>Pick a day. Greyed days aren&apos;t available.</Reason>}
            </>
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </Shell>
  );
}
