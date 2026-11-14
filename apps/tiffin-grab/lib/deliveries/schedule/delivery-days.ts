import { MON_FRI, WEEK_DAYS, type DayOfWeek } from "@/db/schema/enums";
import { isWeekendDay } from "@foundry/commons/util/dates";
/** The one week order (Monday first) and day type; every list of weekdays in the app derives from these. */
export { WEEK_DAYS, MON_FRI, type DayOfWeek } from "@/db/schema/enums";
const MWF: DayOfWeek[] = ["mon", "wed", "fri"];

/** One week's delivery trips: every eating day rides the nearest delivery day at
 * or before it, and delivery days with nothing to carry are dropped. Returns
 * null when an eating day falls before the week's first delivery day (nothing
 * earlier in the plan could carry it) — callers reject that selection. */
export function planWeek(deliveryDays: DayOfWeek[], eatingDays: DayOfWeek[]): { day: DayOfWeek; units: number; days: DayOfWeek[] }[] | null {
  const idx = (d: DayOfWeek) => WEEK_DAYS.indexOf(d);
  const deliveries = [...deliveryDays].sort((a, b) => idx(a) - idx(b));
  const carried = new Map<DayOfWeek, DayOfWeek[]>();
  for (const eat of [...eatingDays].sort((a, b) => idx(a) - idx(b))) {
    const carrier = deliveries.filter((d) => idx(d) <= idx(eat)).pop();
    if (!carrier) return null;
    carried.set(carrier, [...(carried.get(carrier) ?? []), eat]);
  }
  return deliveries.filter((d) => carried.has(d)).map((day) => ({ day, units: carried.get(day)!.length, days: carried.get(day)! }));
}

/** Shared by the wizard and createOrder: null when the eating-day pick is valid for
 * this delivery frequency, otherwise the message to show. */
export function eatingDaysError(deliveryDays: DayOfWeek[], eatingDays: DayOfWeek[], bounds: { min: number; max: number }): string | null {
  if (new Set(eatingDays).size !== eatingDays.length || eatingDays.some((d) => !WEEK_DAYS.includes(d))) return "Invalid eating days";
  if (eatingDays.length < bounds.min || eatingDays.length > bounds.max) {
    return `Pick between ${bounds.min} and ${bounds.max} eating days a week`;
  }
  return planWeek(deliveryDays, eatingDays) ? null : "An eating day falls before this plan's first delivery day";
}

export const NO_WEEKEND_DISH = "This meal has no weekend dish, so it can't be eaten on Saturday or Sunday";

/** Sat/Sun are only for meal sizes holding a weekend-dish category (Catalog → Dish categories). */
export function weekendDaysError(days: readonly DayOfWeek[], servesWeekends: boolean): string | null {
  return !servesWeekends && days.some((d) => isWeekendDay(d)) ? NO_WEEKEND_DISH : null;
}

const SHORT: Record<DayOfWeek, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

/** A meal size's allowed days (Catalog → Meal sizes), null/empty = every day. */
export type AllowedDays = readonly DayOfWeek[] | null | undefined;

const limited = (allowed: AllowedDays): allowed is readonly DayOfWeek[] => allowed != null && allowed.length > 0 && allowed.length < 7;

/** "Mon, Wed and Fri" in week order. */
export function dayList(days: readonly DayOfWeek[]): string {
  const names = WEEK_DAYS.filter((d) => days.includes(d)).map((d) => SHORT[d]);
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
  const base = o.weekdays?.length ? [...o.weekdays] : o.frequencyKey === "mwf" ? [...MWF] : [...MON_FRI];
  if (o.includeSaturday) base.push("sat");
  if (o.includeSunday) base.push("sun");
  return base;
}


/** What a trial order's delivery days are: ignored (frequency days), or its own send days (the frequency's days when it has none). */
export type TrialDays = "ignore" | "sendDays";

/**
 * The days an order's trucks run: its frequency's days (Sat/Sun flags only on an order without eating days), limited to
 * `allowed` unless that would leave nothing, or a trial's own send days per `trial`; a trial with no send days
 * falls back to the frequency's days. `weekdaysOnly` drops Sat/Sun (weekend food rides Friday).
 */
export function planDeliveryDays(
  order: {
    eatingDays?: readonly string[] | null;
    includeSaturday: boolean;
    includeSunday: boolean;
    trialLength?: number | null;
    trialWeekdays?: readonly string[] | null;
  },
  freq: { key: string; weekdays?: DayOfWeek[] | null },
  o: { allowed?: AllowedDays; trial?: TrialDays; weekdaysOnly?: boolean } = {},
): DayOfWeek[] {
  const trial = o.trial ?? "ignore";
  let days: DayOfWeek[];
  if (trial !== "ignore" && order.trialLength != null && order.trialWeekdays?.length) {
    days = [...(order.trialWeekdays ?? [])] as DayOfWeek[];
  } else {
    const flags = !order.eatingDays?.length;
    days = orderDeliveryDays({ frequencyKey: freq.key, weekdays: freq.weekdays, includeSaturday: flags && order.includeSaturday, includeSunday: flags && order.includeSunday });
    const kept = days.filter((d) => dayAllowed(d, o.allowed));
    if (kept.length > 0) days = kept;
  }
  return o.weekdaysOnly ? days.filter((d) => !isWeekendDay(d)) : days;
}
