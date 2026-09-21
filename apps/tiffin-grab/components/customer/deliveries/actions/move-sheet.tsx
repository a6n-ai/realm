"use client";
import { Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { rescheduleMyDelivery } from "@/app/(customer)/me/deliveries/actions";
import { Button, DateStrip, Notice, Reason, Sheet } from "@/components/customer/kit";
import { actionAvailability, humanDate } from "@/lib/deliveries-view";
import { weekdayShort } from "@/lib/deliveries-view/eating";
import { moveOptions } from "@/lib/deliveries-view/move";
import { formatCoversLabel } from "@/lib/menu/coverage";
import type { ActionSheetProps } from "./types";
import { useCommit } from "./use-commit";

const MON = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
/** Same style as the hub's week label: "SEP 24 – OCT 21" for the days on offer. */
function rangeOf(dates: string[]): string {
  if (dates.length === 0) return "";
  const f = (iso: string) => `${MON.format(new Date(`${iso}T00:00:00Z`))} ${Number(iso.slice(8))}`;
  return `${f(dates[0]!)} – ${f(dates[dates.length - 1]!)}`;
}
const tiffins = (n: number) => `${n} ${n === 1 ? "tiffin" : "tiffins"}`;

export function MoveSheet({ trip, plan, open, onDone }: ActionSheetProps) {
  const [now] = useState(() => Date.now());
  const av = actionAvailability(trip, now, plan.ctx).move;
  const options = useMemo(() => moveOptions(trip, plan.days, now, plan.ctx, plan.today), [trip, plan, now]);
  const [picked, setPicked] = useState<string | null>(null);
  const { pending, error, run } = useCommit(onDone);
  const chosen = options.find((o) => o.date === picked);
  const held = trip.status === "hold";
  const day = humanDate(trip.date);

  const confirm = () => {
    if (!trip.deliveryId || !picked) return;
    void run(
      () => rescheduleMyDelivery(trip.deliveryId!, picked),
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
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted-foreground,#6E6558)]">{rangeOf(options.map((o) => o.date))}</p>
              <DateStrip label="New day to eat" days={options.map((o) => ({ ...o, delivery: o.carriedOn === o.date }))} value={picked} onChange={setPicked} />
              {!chosen && <Reason>Choose a day to continue.</Reason>}
              {chosen?.merge ? (
                <Notice>
                  {humanDate(chosen.date)} already has a delivery. Both trips combine into one: {tiffins(chosen.merge.units)} on {humanDate(chosen.date)}. {formatCoversLabel(chosen.merge.covers)}.
                </Notice>
              ) : chosen && chosen.carriedOn !== chosen.date ? (
                <Notice>{humanDate(chosen.date)} will arrive {humanDate(chosen.carriedOn)} with {weekdayShort(chosen.carriedOn)}. We don&apos;t deliver on {weekdayShort(chosen.date)}s, so it rides on the earlier delivery.</Notice>
              ) : chosen ? (
                <Notice>Your {tiffins(trip.units)} will arrive on {humanDate(chosen.date)}.</Notice>
              ) : null}
              <Reason>
                <Truck aria-hidden className="mr-1 inline size-3.5 align-[-2px]" /> marks delivery days. {held ? "Uses one of your hold days. " : ""}Days already covered stay with this trip. Once moved, it can&apos;t be put back on hold.
              </Reason>
            </>
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </Sheet>
  );
}
