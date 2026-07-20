// Plain module (no "use client") so the server page AND the client calendar can both import
// these constants directly. Never import a value from delivery-calendar.tsx into page.tsx — a
// Server Component importing a value from a "use client" module gets a client reference back,
// not the real value (the /dashboard/orders bug this pattern exists to avoid).

import type { CalendarDay } from "@/lib/services/customer-deliveries.service";
import { mondayOfIso } from "@/lib/menu/delivery-dates";

// myCalendar attaches menuWeekId via menuService.getReleasedWeeks (same gate as Menu).
export type CalendarCell = CalendarDay;

// Still consumed by components/customer/home/subscription-section.tsx's status pill (the home
// page's subscription card, out of this redesign's scope) — kept even though the calendar's own
// SubscriptionSection no longer uses it.
type Tone = "neutral" | "ok" | "warn" | "bad";

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
};

export type SubscriptionStatus = "active" | "paused";

export const SUB_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: "Active",
  paused: "Paused",
};

/** `YYYY-MM` for the calendar month being viewed. */
export function currentMonthKey(today: string): string {
  return today.slice(0, 7);
}

/** Resolve `?month=`; defaults to today's month and never goes to a past month. */
export function parseMonthParam(monthParam: string | undefined, today: string): string {
  const floor = currentMonthKey(today);
  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) return floor;
  return monthParam < floor ? floor : monthParam;
}

/** Inclusive calendar-month bounds for delivery reads; `from` is clamped to today. */
export function monthFetchRange(monthKey: string, today: string): { from: string; until: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const until = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const from = first < today ? today : first;
  return { from, until };
}

/** Monday of the week to load menu options for a selected day (on/after today's week). */
export function menuWeekForDay(dayIso: string, today: string): string {
  const minMonday = mondayOfIso(today);
  const monday = mondayOfIso(dayIso);
  return monday < minMonday ? minMonday : monday;
}

// react-day-picker Day objects (and JS Date in general) are constructed from local, not UTC,
// year/month/day fields — this mirrors that back to a plain "YYYY-MM-DD" so it lines up with
// `deliveryDate`/`date` (calendar dates, not instants) regardless of the browser's own timezone.
// Never use parseIsoDateUtc for this: that returns a UTC-midnight Date, which shifts by a day
// against a local Date in any timezone west of UTC (the "spec-6 bug" referenced elsewhere).
export function toIsoLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Inverse of toIsoLocal: a calendar-date ISO string to a local midnight Date, for date-fns calls.
export function parseIsoLocal(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}
