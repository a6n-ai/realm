// Plain module (no "use client") so the server page AND the client calendar can both import
// these constants directly. Never import a value from delivery-calendar.tsx into page.tsx — a
// Server Component importing a value from a "use client" module gets a client reference back,
// not the real value (the /dashboard/orders bug this pattern exists to avoid).

import type { CalendarDay } from "@/lib/services/customer-deliveries.service";

// myCalendar's CalendarDay doesn't carry the released week's own id — page.tsx resolves it
// separately (menuWeeks lookup by planType+weekStart) since pickMyDish/applyMyDishToWeek need it.
export type CalendarCell = CalendarDay & { menuWeekId: string | null };

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

// Calendar fetch-window size: page.tsx reads [today, today+WINDOW_DAYS*(extraWindows+1)] from
// myCalendar/myDeliveries. 35 days (5 Mon-Sun weeks) so the desktop MonthCalendar always has a
// full month's worth of real data; "Load more weeks" bumps extraWindows via ?days=N.
export const WINDOW_DAYS = 35;

// Hard ceiling on `?days=`: a hand-edited URL can otherwise force an unbounded date-range read.
export const MAX_EXTRA_WINDOWS = 12;

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
