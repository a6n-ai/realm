import { humanDate, type Trip, type TripStatus } from "./index";

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
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

const ARRIVING: TripStatus[] = ["upcoming", "delivered", "cutoff-passed", "locked"];

/**
 * Eating rows for one calendar week. A moved tiffin keeps its original eat date and
 * the truck moves, so a row whose eat date is last week still belongs in the week
 * the truck arrives — otherwise that delivery day reads as nothing planned.
 */
export function eatingRowsInWeek(trips: Trip[], weekStart: string, weekEnd: string): EatingRow[] {
  return buildEatingDays(trips).filter((r) => {
    if (r.date >= weekStart && r.date <= weekEnd) return true;
    return ARRIVING.includes(r.trip.status) && r.trip.date >= weekStart && r.trip.date <= weekEnd;
  });
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
