"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import { formatDateOnly, formatMenuWeekRange } from "@/lib/format/datetime";
import { subscriptionTrips, tripsByWeek, type DatedTrip } from "@/lib/menu/delivery-dates";
import { orderDeliveryDays, type DayOfWeek } from "@/lib/menu/delivery-days";
import { trialDeliveryDates } from "@/lib/trial/schedule";
import { TripTimeline } from "./trip-timeline";

/** Every delivery a new order would get, trial or weekly, from the same date walks the server runs. Null while incomplete or invalid. */
export function plannedSchedule(
  input:
    | { kind: "trial"; startDate: string; picks: readonly string[] }
    | { kind: "weekly"; startDate: string; durationWeeks: number; frequency?: { key: string; weekdays: readonly string[] | null } | null; eatingDays: readonly string[] },
): { trips: DatedTrip[]; shifted: boolean } | null {
  if (!input.startDate) return null;
  try {
    if (input.kind === "trial") {
      if (!input.picks.length) return null;
      const dates = trialDeliveryDates(input.startDate, input.picks.length, input.picks);
      return {
        trips: dates.map((d) => {
          const day = weekdayKey(parseIsoDateUtc(d)) as DayOfWeek;
          return { dateIso: d, day, units: 1, days: [day] };
        }),
        shifted: false,
      };
    }
    if (!input.frequency || !input.eatingDays.length) return null;
    return subscriptionTrips({
      startDate: input.startDate,
      durationWeeks: input.durationWeeks,
      deliveryDays: orderDeliveryDays({ frequencyKey: input.frequency.key, weekdays: input.frequency.weekdays as DayOfWeek[] | null, includeSaturday: false, includeSunday: false }),
      eatingDays: input.eatingDays as DayOfWeek[],
    });
  } catch {
    return null;
  }
}

const H = "text-muted-foreground text-[13px] font-semibold tracking-[0.02em]";

/** The Schedule step's timeline with real dates, one calendar week at a time across the whole plan. */
export function ScheduleCard({ trips, shifted }: { trips: DatedTrip[]; shifted: boolean }) {
  const weeks = tripsByWeek(trips);
  const [page, setPage] = useState(0);
  // A new start date or duration reshapes the weeks; go back to the first.
  const shape = `${trips[0]!.dateIso}:${trips.length}`;
  const [seen, setSeen] = useState(shape);
  if (seen !== shape) {
    setSeen(shape);
    setPage(0);
  }
  const i = Math.min(page, weeks.length - 1);
  const w = weeks[i]!;
  const last = i === weeks.length - 1;
  const short = (iso: string) => formatDateOnly(iso, { mode: "short" });
  const navBtn = "border-border hover:bg-muted grid size-8 place-items-center rounded-full border disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <section aria-labelledby="start-preview" className="bg-card border-border rounded-[20px] border p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <h2 id="start-preview" className={H}>How your tiffins arrive</h2>
        <p className="text-sm">
          <strong>{short(trips[0]!.dateIso)}</strong>
          <span className="text-muted-foreground"> to </span>
          <strong>{short(trips.at(-1)!.dateIso)}</strong>
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold" aria-live="polite">
          Week {i + 1} of {weeks.length}
          <span className="text-muted-foreground font-normal"> · {formatMenuWeekRange(w.weekStart)}</span>
        </p>
        {weeks.length > 1 && (
          <div className="flex gap-1.5">
            <button type="button" className={navBtn} disabled={i === 0} onClick={() => setPage(i - 1)} aria-label="Previous week">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" className={navBtn} disabled={last} onClick={() => setPage(i + 1)} aria-label="Next week">
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
      <TripTimeline trips={w.trips} weekStart={w.weekStart} />
      {last && shifted && weeks.length > 1 && (
        <p className="text-muted-foreground mt-3 text-xs text-pretty">
          Days in your first week before your start date are added here, so you still get every tiffin.
        </p>
      )}
    </section>
  );
}

