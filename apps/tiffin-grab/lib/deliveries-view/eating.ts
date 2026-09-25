import { humanDate, type Trip } from "./index";

/** The customer's unit of thought: one eating day, fed by the trip (delivery day) that carries it. */
export type EatingRow = {
  orderId: string;
  date: string;
  trip: Trip;
  dish: string | null;
  swaps: string[];
  /** True when this is the delivery day itself (the truck arrives today). */
  own: boolean;
};

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const weekdayShort = (iso: string) => WD[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;

/** Eating days of the given trips, in date order. Merged-source trips add nothing: their day is in the target's covers. */
export function buildEatingDays(trips: Trip[]): EatingRow[] {
  const rows: EatingRow[] = [];
  const covered = new Set(trips.filter((t) => t.status !== "combined-into").flatMap((t) => t.coversDates));
  for (const trip of trips) {
    const moved = trip.status === "rescheduled" || trip.status === "combined-into";
    for (const e of trip.eatingDays) {
      // A merged source shows only the days its target does not already carry: those read "Moved to ...".
      if (trip.status === "combined-into" && covered.has(e.date)) continue;
      rows.push({ orderId: trip.orderId, date: e.date, trip, dish: moved ? null : e.dishSummary, swaps: moved ? [] : e.swaps, own: e.date === trip.date });
    }
    // The truck can land on a day that isn't one of the eating dates (Friday's tiffin
    // arrives Thursday). That day must be a row, or tapping it says nothing is planned.
    const live = trip.status !== "rescheduled" && trip.status !== "combined-into";
    if (live && !trip.eatingDays.some((e) => e.date === trip.date) && !covered.has(trip.date)) {
      const dishes = trip.eatingDays.map((e) => e.dishSummary).filter((d): d is string => !!d);
      rows.push({ orderId: trip.orderId, date: trip.date, trip, dish: dishes.length ? dishes.join(", ") : null, swaps: [], own: true });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** "Arrives Mon, Sep 21 with Mon" / "Delivered Mon, Sep 21": which truck feeds this eating day. */
export function deliveryLine(r: EatingRow): string {
  const t = r.trip;
  const day = humanDate(t.date);
  const with_ = r.own ? "" : ` with ${weekdayShort(t.date)}`;
  switch (t.status) {
    case "delivered": return `Delivered ${day}${with_}`;
    case "cutoff-passed": return `Being prepared, arrives ${day}${with_}`;
    case "upcoming": return `Arrives ${day}${with_}`;
    case "rescheduled": case "combined-into": return t.movedTo ? `Moved to ${humanDate(t.movedTo)}` : "Moved";
    case "hold": return "On hold";
    case "vacation": return "On vacation";
    default: return `Arrives ${day}${with_}`;
  }
}
