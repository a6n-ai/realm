import type { DeliveryStatus } from "@/components/customer/kit";

export type AgendaDot = { orderId: string; status: "scheduled" | "paused" | "skipped" | "cancelled"; cutoffAt: number; deliveryDate: string; truck: boolean; units: number; covers: string[] };
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

/** Current week if any plan delivers in it, else the week of the next delivery on/after today, else the current week. */
export function defaultWeek(today: string, agenda: Agenda): string {
  const cur = mondayOf(today);
  const dates = Object.keys(agenda).sort();
  if (dates.some((d) => d >= cur && d <= addDays(cur, 6))) return cur;
  const next = dates.find((d) => d >= today);
  return next ? mondayOf(next) : cur;
}

export function dotStatus(d: AgendaDot, now: number): DeliveryStatus {
  if (d.status === "paused") return "vacation";
  if (d.status === "skipped") return "hold";
  return now >= d.cutoffAt ? "delivered" : "upcoming";
}

/** Stable colour per plan, by position in the customer's plan list. */
export const PLAN_COLORS = ["#c2410c", "#2563eb", "#7c3aed", "#0d9488", "#be185d", "#4d7c0f"];
