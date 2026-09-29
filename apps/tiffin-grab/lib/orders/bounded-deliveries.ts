import { orderDeliveryDays, planWeek, type DayOfWeek } from "@/lib/menu/delivery-days";
import { subscriptionDeliveryDates } from "@/lib/menu/delivery-dates";
import { tripCoverage } from "@/lib/menu/coverage";

// A plan migrated from WordPress carries a remaining balance (e.g. 17 tiffins) that
// rarely fills whole weeks, which materializeDeliveries refuses. These mirror its
// trip logic but stop once the balance is used up.

export type Trip = { day: DayOfWeek; units: number; days: DayOfWeek[] };

/** The delivery trips (day + tiffins carried) for a plan: its frequency's delivery days
 * carry the eating days, exactly as materializeDeliveries does for new orders. */
export function tripsFor(frequencyKey: string, eatingDays: DayOfWeek[]): Trip[] {
  const deliveryDays = orderDeliveryDays({ frequencyKey, includeSaturday: false, includeSunday: false });
  const trips = planWeek(deliveryDays, eatingDays);
  if (!trips?.length) throw new Error(`No delivery trips for ${frequencyKey} with eating days ${eatingDays.join("/")}`);
  return trips;
}

export type BoundedDeliveryRow = { deliveryDate: string; tiffinUnits: number; coversDates: string[] };

export function buildBoundedDeliveryRows(input: {
  startDate: string;
  trips: Trip[];
  persons: number;
  targetTiffinCount: number;
}): BoundedDeliveryRow[] {
  const tripByDay = new Map(input.trips.map((t) => [t.day, t]));
  const perWeek = input.trips.reduce((n, t) => n + t.units * input.persons, 0);
  const weeksNeeded = Math.ceil(input.targetTiffinCount / Math.max(1, perWeek)) + 3;

  const dates = subscriptionDeliveryDates({
    startDate: input.startDate,
    durationWeeks: weeksNeeded,
    deliveryDays: input.trips.map((t) => t.day),
  });

  // The row that crosses the balance is clamped to what's left rather than kept whole
  // (a bundled Friday would over-deliver already-paid tiffins) or dropped. Its coverage
  // shrinks with it: only the first carried days that still get a tiffin.
  let cumulative = 0;
  const kept: BoundedDeliveryRow[] = [];
  for (const d of dates) {
    if (cumulative >= input.targetTiffinCount) break;
    const trip = tripByDay.get(d.dayOfWeek)!;
    const units = Math.min(trip.units * input.persons, input.targetTiffinCount - cumulative);
    const covers = tripCoverage(d.dateIso, trip.day, trip.days).slice(0, Math.ceil(units / input.persons));
    kept.push({ deliveryDate: d.dateIso, tiffinUnits: units, coversDates: covers });
    cumulative += units;
  }
  return kept;
}

function dayAfter(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** The first delivery trip strictly after `lastDelivered` (the day a migrated plan picks up). */
export function nextTripDate(lastDelivered: string, trips: Trip[]): string {
  return buildBoundedDeliveryRows({ startDate: dayAfter(lastDelivered), trips, persons: 1, targetTiffinCount: 1 })[0]!.deliveryDate;
}

/** Last delivery date if the balance is scheduled from `startDate`: the plan's end date. */
export function projectedEndDate(input: { startDate: string; trips: Trip[]; persons: number; targetTiffinCount: number }): string | null {
  if (input.targetTiffinCount <= 0) return null;
  return buildBoundedDeliveryRows(input).at(-1)?.deliveryDate ?? null;
}
