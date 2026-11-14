import { WEEK_DAYS, type DayOfWeek } from "@/lib/deliveries/schedule/delivery-days";
import { addDaysIso, isoToUtcDate, mondayIndex, mondayOfIso } from "@foundry/commons/util/dates";
import { deliveryTripState, type DeliveryStatus } from "@/lib/deliveries/status";

export type AgendaDot = { orderId: string; status: "scheduled" | "paused" | "skipped" | "cancelled"; cutoffAt: number; deliveryDate: string; truck: boolean; units: number; covers: string[]; moved?: boolean; holiday?: string | null; optimoCompletionStatus?: string | null; deliveryId?: string; /** A hold that began as a pause: still drawn as Paused. */ lapsedPause?: boolean };
export type Agenda = Record<string, AgendaDot[]>;

export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i));

export const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** ?week must be a real date; it snaps to that week's Monday. Anything else is ignored. */
export function parseWeekParam(p: string | undefined): string | null {
  if (!p || !ISO.test(p) || Number.isNaN(isoToUtcDate(p).getTime())) return null;
  return mondayOfIso(p);
}

/** The plan's start week until it starts, then the current week. */
export function defaultWeek(today: string, planFirst: string | null | undefined): string {
  return mondayOfIso(planFirst && planFirst > today ? planFirst : today);
}

/**
 * This plan's dots, plus the delivery days another of the customer's live plans already has. Move greys
 * those out: plans never overlap, so a tiffin moved there would double up with the renewal.
 * Value: "renewal" when that plan delivers after this one starts, else "earlier plan".
 */
export function splitAgenda(all: Agenda, orderId: string, startDate?: string): { agenda: Agenda; otherPlanDays: Record<string, string> } {
  const agenda: Agenda = {};
  const otherPlanDays: Record<string, string> = {};
  for (const [date, ds] of Object.entries(all)) {
    const mine = ds.filter((d) => d.orderId === orderId);
    if (mine.length) agenda[date] = mine;
    for (const d of ds) {
      if (d.orderId === orderId || !d.truck || d.moved || d.holiday || (d.status !== "scheduled" && d.status !== "paused")) continue;
      otherPlanDays[d.deliveryDate] = !startDate || d.deliveryDate > startDate ? "renewal" : "earlier plan";
    }
  }
  return { agenda, otherPlanDays };
}

/** Stable colour per plan, by position in the customer's plan list. */
export const PLAN_COLORS = ["#c2410c", "#2563eb", "#7c3aed", "#0d9488", "#be185d", "#4d7c0f"];

const weekdayOf = (iso: string): DayOfWeek => WEEK_DAYS[mondayIndex(iso)]!;

/** One week of the agenda as timeline trips: each truck day carries the eating days in its week, coloured by status. */
export function weekTimeline(agenda: Agenda, monday: string): {
  trips: { day: DayOfWeek; units: number; days: DayOfWeek[]; status: DeliveryStatus }[];
  dayStatus: Partial<Record<DayOfWeek, DeliveryStatus>>;
} {
  const days = weekDays(monday);
  const inWeek = new Set(days);
  const dayStatus: Partial<Record<DayOfWeek, DeliveryStatus>> = {};
  const trips = new Map<string, { day: DayOfWeek; units: number; days: DayOfWeek[]; status: DeliveryStatus }>();
  for (const iso of days) {
    for (const d of agenda[iso] ?? []) {
      dayStatus[weekdayOf(iso)] ??= deliveryTripState(d);
      if (!d.truck || trips.has(d.deliveryDate)) continue;
      const covers = d.covers.filter((c) => inWeek.has(c));
      // A moved-away truck day still delivers: the trip keeps its own status.
      trips.set(d.deliveryDate, { day: weekdayOf(d.deliveryDate), units: d.units, days: (covers.length ? covers : [iso]).map(weekdayOf), status: deliveryTripState({ ...d, moved: false }) });
    }
  }
  return { trips: [...trips.values()], dayStatus };
}
