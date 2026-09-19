export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const FIVE_DAY: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"];
const MWF: DayOfWeek[] = ["mon", "wed", "fri"];
const WEEK_ORDER: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** Deterministic delivery_frequencies.key for an arbitrary weekday set — the
 * same pattern always resolves to the same catalog row, regardless of the
 * order the days were picked/typed in. Shared by the legacy-import script and
 * the live wizard/createOrder path so a customer's custom picker and an
 * imported legacy pattern never fork into two different keys for the same
 * set of days. */
export function customFrequencyKey(weekdays: DayOfWeek[]): string {
  return `custom_${[...weekdays].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)).join("_")}`;
}

/** For a weekday set with fewer than 7 selected days, how many tiffins each
 * delivery day carries: itself plus every non-selected day up to (not
 * including) the next selected day, cyclic across the week boundary. Sum
 * across one full cycle always equals `weekdays.length` (a tiffin for every
 * calendar day, delivered on the nearest selected day at/after it). */
export function clubbedQuantities(weekdays: DayOfWeek[]): Record<DayOfWeek, number> {
  const result = {} as Record<DayOfWeek, number>;
  if (weekdays.length === 0) return result;
  const selected = new Set(weekdays);
  for (const day of weekdays) {
    let qty = 1;
    let idx = (WEEK_ORDER.indexOf(day) + 1) % 7;
    while (!selected.has(WEEK_ORDER[idx])) {
      qty += 1;
      idx = (idx + 1) % 7;
    }
    result[day] = qty;
  }
  return result;
}

/** One week's delivery trips: every eating day rides the nearest delivery day at
 * or before it, and delivery days with nothing to carry are dropped. Returns
 * null when an eating day falls before the week's first delivery day (nothing
 * earlier in the plan could carry it) — callers reject that selection. */
export function planWeek(deliveryDays: DayOfWeek[], eatingDays: DayOfWeek[]): { day: DayOfWeek; units: number }[] | null {
  const idx = (d: DayOfWeek) => WEEK_ORDER.indexOf(d);
  const deliveries = [...deliveryDays].sort((a, b) => idx(a) - idx(b));
  const units = new Map<DayOfWeek, number>();
  for (const eat of eatingDays) {
    const carrier = deliveries.filter((d) => idx(d) <= idx(eat)).pop();
    if (!carrier) return null;
    units.set(carrier, (units.get(carrier) ?? 0) + 1);
  }
  return deliveries.filter((d) => units.has(d)).map((day) => ({ day, units: units.get(day)! }));
}

/** Shared by the wizard and createOrder: null when the eating-day pick is valid for
 * this delivery frequency, otherwise the message to show. */
export function eatingDaysError(deliveryDays: DayOfWeek[], eatingDays: DayOfWeek[], bounds: { min: number; max: number }): string | null {
  if (new Set(eatingDays).size !== eatingDays.length || eatingDays.some((d) => !WEEK_ORDER.includes(d))) return "Invalid eating days";
  if (eatingDays.length < bounds.min || eatingDays.length > bounds.max) {
    return `Pick between ${bounds.min} and ${bounds.max} eating days a week`;
  }
  return planWeek(deliveryDays, eatingDays) ? null : "An eating day falls before this plan's first delivery day";
}

/** Starting eating days for a frequency: eat on the days it delivers (clipped to the max). */
export function defaultEatingDays(deliveryDays: DayOfWeek[], max: number): DayOfWeek[] {
  return WEEK_ORDER.filter((d) => deliveryDays.includes(d)).slice(0, max);
}

export function orderDeliveryDays(o: {
  frequencyKey: string;
  weekdays?: DayOfWeek[] | null;
  includeSaturday: boolean;
  includeSunday: boolean;
}): DayOfWeek[] {
  // An explicit weekday set (delivery_frequencies.weekdays) wins over the two
  // hardcoded shapes — used for cadences that are neither 5-day nor MWF, e.g.
  // a legacy customer migrated on "Tuesday - Thursday" only.
  const base = o.weekdays?.length ? [...o.weekdays] : o.frequencyKey === "mwf" ? [...MWF] : [...FIVE_DAY];
  if (o.includeSaturday) base.push("sat");
  if (o.includeSunday) base.push("sun");
  return base;
}

export function visibleSlots(orderSlots: string[], enabled: string[], dayItems: { slot: string }[]): string[] {
  const offered = new Set(dayItems.map((i) => i.slot));
  return orderSlots.filter((s) => enabled.includes(s) && offered.has(s));
}
