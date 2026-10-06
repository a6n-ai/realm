import type { DeliveryStatus } from "@/components/customer/kit";

export type AgendaDot = { orderId: string; status: "scheduled" | "paused" | "skipped" | "cancelled"; cutoffAt: number; deliveryDate: string; truck: boolean; units: number; covers: string[]; moved?: boolean; optimoCompletionStatus?: string | null; deliveryId?: string };
export type Agenda = Record<string, AgendaDot[]>;

const DAY = 864e5;
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const mondayOf = (iso: string) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** ?week must be a real date; it snaps to that week's Monday. Anything else is ignored. */
export function parseWeekParam(p: string | undefined): string | null {
  if (!p || !ISO.test(p) || Number.isNaN(Date.parse(`${p}T00:00:00Z`))) return null;
  return mondayOf(p);
}

/** The plan's start week until it starts, then the current week. */
export function defaultWeek(today: string, planFirst: string | null | undefined): string {
  return mondayOf(planFirst && planFirst > today ? planFirst : today);
}

export function dotStatus(d: AgendaDot, now: number): DeliveryStatus {
  if (d.moved) return "combined";
  if (d.status === "paused") return "vacation";
  if (d.status === "skipped") return "hold";
  if (d.optimoCompletionStatus === "failed") return "hold";
  if (d.optimoCompletionStatus === "success") return "delivered";
  // Not confirmed by OptimoRoute or an admin yet, whatever the cutoff says.
  return "upcoming";
}

/** Stable colour per plan, by position in the customer's plan list. */
export const PLAN_COLORS = ["#c2410c", "#2563eb", "#7c3aed", "#0d9488", "#be185d", "#4d7c0f"];

const WEEKDAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type Weekday = (typeof WEEKDAY)[number];
const weekdayOf = (iso: string): Weekday => WEEKDAY[(new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7]!;

/** One week of the agenda as timeline trips: each truck day carries the eating days in its week, coloured by status. */
export function weekTimeline(agenda: Agenda, monday: string, now: number): {
  trips: { day: Weekday; units: number; days: Weekday[]; status: DeliveryStatus }[];
  dayStatus: Partial<Record<Weekday, DeliveryStatus>>;
} {
  const days = weekDays(monday);
  const inWeek = new Set(days);
  const dayStatus: Partial<Record<Weekday, DeliveryStatus>> = {};
  const trips = new Map<string, { day: Weekday; units: number; days: Weekday[]; status: DeliveryStatus }>();
  for (const iso of days) {
    for (const d of agenda[iso] ?? []) {
      dayStatus[weekdayOf(iso)] ??= dotStatus(d, now);
      if (!d.truck || trips.has(d.deliveryDate)) continue;
      const covers = d.covers.filter((c) => inWeek.has(c));
      trips.set(d.deliveryDate, { day: weekdayOf(d.deliveryDate), units: d.units, days: (covers.length ? covers : [iso]).map(weekdayOf), status: dotStatus(d, now) });
    }
  }
  return { trips: [...trips.values()], dayStatus };
}
