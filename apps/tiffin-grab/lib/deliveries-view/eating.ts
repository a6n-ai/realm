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
  for (const trip of trips) {
    if (trip.status === "combined-into") continue;
    for (const e of trip.eatingDays) rows.push({ orderId: trip.orderId, date: e.date, trip, dish: e.dishSummary, swaps: e.swaps, own: e.date === trip.date });
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
    case "hold": case "rescheduled": return "On hold";
    case "vacation": return "On vacation";
    default: return `Arrives ${day}${with_}`;
  }
}
