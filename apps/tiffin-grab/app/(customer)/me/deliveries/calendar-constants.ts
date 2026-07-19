// Plain module (no "use client") so the server page AND the client calendar can both import
// these constants directly. Never import a value from delivery-calendar.tsx into page.tsx — a
// Server Component importing a value from a "use client" module gets a client reference back,
// not the real value (the /dashboard/orders bug this pattern exists to avoid).

import type { CalendarDay } from "@/lib/services/customer-deliveries.service";

// myCalendar's CalendarDay doesn't carry the released week's own id — page.tsx resolves it
// separately (menuWeeks lookup by planType+weekStart) since pickMyDish/applyMyDishToWeek need it.
export type CalendarCell = CalendarDay & { menuWeekId: string | null };

export type DeliveryStatus = "scheduled" | "paused" | "skipped" | "cancelled";

export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  scheduled: "Scheduled",
  paused: "Paused",
  skipped: "Skipped",
  cancelled: "Cancelled",
};

type Tone = "neutral" | "ok" | "warn" | "bad";

export const STATUS_TONE: Record<DeliveryStatus, Tone> = {
  scheduled: "ok",
  paused: "warn",
  skipped: "bad",
  cancelled: "neutral",
};

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

// Load-more window size. Both page.tsx (date math for `until`) and delivery-calendar.tsx
// (bumping the `?days=` search param) key off the same constant.
export const WINDOW_DAYS = 14;

// Hard ceiling on `?days=`: a hand-edited URL can otherwise force an unbounded date-range read.
export const MAX_EXTRA_WINDOWS = 12;
