export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const FIVE_DAY: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"];
const MWF: DayOfWeek[] = ["mon", "wed", "fri"];
const WEEK_ORDER: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

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
export function planWeek(deliveryDays: DayOfWeek[], eatingDays: DayOfWeek[]): { day: DayOfWeek; units: number; days: DayOfWeek[] }[] | null {
  const idx = (d: DayOfWeek) => WEEK_ORDER.indexOf(d);
  const deliveries = [...deliveryDays].sort((a, b) => idx(a) - idx(b));
  const carried = new Map<DayOfWeek, DayOfWeek[]>();
  for (const eat of [...eatingDays].sort((a, b) => idx(a) - idx(b))) {
    const carrier = deliveries.filter((d) => idx(d) <= idx(eat)).pop();
    if (!carrier) return null;
    carried.set(carrier, [...(carried.get(carrier) ?? []), eat]);
  }
  return deliveries.filter((d) => carried.has(d)).map((day) => ({ day, units: carried.get(day)!.length, days: carried.get(day)! }));
}

/** Delivery weekdays whose plan pattern already carries `max` tiffins (e.g. Fri carrying Fri+Sat+Sun): nothing can be moved onto them or the days that ride them. */
export function fullCarryWeekdays(deliveryDays: DayOfWeek[], eatingDays: DayOfWeek[], max: number): Set<DayOfWeek> {
  return new Set((planWeek(deliveryDays, eatingDays) ?? []).filter((t) => t.units >= max).map((t) => t.day));
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

export const NO_WEEKEND_DISH = "This meal has no weekend dish, so it can't be eaten on Saturday or Sunday";

/** Sat/Sun are only for meal sizes holding a weekend-dish category (Catalog → Dish categories). */
export function weekendDaysError(days: readonly DayOfWeek[], servesWeekends: boolean): string | null {
  return !servesWeekends && days.some((d) => d === "sat" || d === "sun") ? NO_WEEKEND_DISH : null;
}

const SHORT: Record<DayOfWeek, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

/** A meal size's allowed days (Catalog → Meal sizes), null/empty = every day. */
export type AllowedDays = readonly DayOfWeek[] | null | undefined;

const limited = (allowed: AllowedDays): allowed is readonly DayOfWeek[] => allowed != null && allowed.length > 0 && allowed.length < 7;

/** "Mon, Wed and Fri" in week order. */
export function dayList(days: readonly DayOfWeek[]): string {
  const names = WEEK_ORDER.filter((d) => days.includes(d)).map((d) => SHORT[d]);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function onlyOnMessage(allowed: readonly DayOfWeek[]): string {
  return `This meal is only made on ${dayList(allowed)}`;
}

/** Can this day be eaten on / delivered for this meal size? */
export function dayAllowed(day: DayOfWeek, allowed: AllowedDays): boolean {
  return !limited(allowed) || allowed.includes(day);
}

/** Sibling of weekendDaysError: a meal size made only on some days (e.g. non-veg only, while Tue/Thu are veg-only). */
export function allowedDaysError(days: readonly DayOfWeek[], allowed: AllowedDays): string | null {
  return limited(allowed) && days.some((d) => !allowed.includes(d)) ? onlyOnMessage(allowed) : null;
}

/** A delivery frequency fits a meal size only when every one of its delivery days is allowed. */
export function frequencyFits(weekdays: readonly DayOfWeek[] | null | undefined, allowed: AllowedDays): boolean {
  return !limited(allowed) || (weekdays != null && weekdays.length > 0 && weekdays.every((d) => allowed.includes(d)));
}

/**
 * The day rules for one order's picks, in one place for createOrder and both price previews: weekend dish,
 * then the frequency fit, then the allowed days. Sat/Sun flags count as eating days. Trials ride the Trial
 * settings frequency, so they skip the fit. `frequencyWeekdays` undefined = no frequency picked yet.
 */
export function planDaysError(p: {
  eatingDays: readonly DayOfWeek[];
  includeSaturday?: boolean;
  includeSunday?: boolean;
  frequencyWeekdays?: readonly DayOfWeek[] | null;
  servesWeekends: boolean;
  allowed: AllowedDays;
  trial: boolean;
}): string | null {
  const eaten: DayOfWeek[] = [...p.eatingDays, ...(p.includeSaturday ? ["sat" as const] : []), ...(p.includeSunday ? ["sun" as const] : [])];
  const unfit = !p.trial && p.frequencyWeekdays !== undefined && !frequencyFits(p.frequencyWeekdays, p.allowed);
  return weekendDaysError(eaten, p.servesWeekends) ?? (unfit ? onlyOnMessage(p.allowed!) : null) ?? allowedDaysError(eaten, p.allowed);
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
