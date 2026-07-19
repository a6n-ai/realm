// Plain module (no "use client"): pure day-status derivation, shared by the desktop
// calendar's day-dot slot, the mobile week strip, and the agenda/drawer body. Kept
// separate from calendar-constants.ts because DayStatus is a UI-only concept layered
// on top of DeliveryStatus + isMakeup + cutoff, not a value that ever round-trips
// through the DB or a server action.

// "off" is a distinct inert state from "locked" — a day with no CalendarCell because it isn't in
// the plan's delivery pattern (weekend/off day) or its week isn't released yet. It is never
// derived from deliveryDayStatus/calendarDayStatus (both require a real delivery/cell); callers
// assign it directly when a cell is absent, so it never gets the cutoff "sealed" treatment.
export type DayStatus = "scheduled" | "paused" | "skipped" | "locked" | "makeup" | "off";

// A day is "locked" once its cutoff has passed, regardless of the underlying delivery
// status — this is the one status that overrides the raw `status` column, mirroring the
// server-side guard (pauseOrder/skipDelivery reject past-cutoff deliveries the same way).
export function deliveryDayStatus(
  d: { status: string; isMakeup: boolean; cutoffAt: number },
  now: number,
): DayStatus {
  if (d.isMakeup) return "makeup";
  if (now >= d.cutoffAt) return "locked";
  if (d.status === "paused") return "paused";
  if (d.status === "skipped") return "skipped";
  return "scheduled";
}

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  scheduled: "Scheduled",
  paused: "Paused",
  skipped: "Skipped",
  locked: "Locked",
  makeup: "Make-up",
  off: "Not scheduled",
};

// Customer-facing legend on the calendar surface (Akshayakalpa reference: Delivered / Upcoming /
// Vacation / On Hold) — maps our internal DayStatus buckets to plain-language copy + dash color.
export type CalendarLegendKey = "delivered" | "upcoming" | "vacation" | "onHold";

export const CALENDAR_LEGEND: { key: CalendarLegendKey; label: string; dashClass: string }[] = [
  { key: "delivered", label: "Delivered", dashClass: "bg-ok" },
  { key: "upcoming", label: "Upcoming", dashClass: "bg-blue-500" },
  { key: "vacation", label: "Vacation", dashClass: "bg-warn" },
  { key: "onHold", label: "On Hold", dashClass: "bg-destructive" },
];

export function calendarLegendKey(status: DayStatus): CalendarLegendKey | null {
  switch (status) {
    case "locked":
      return "delivered";
    case "scheduled":
    case "makeup":
      return "upcoming";
    case "paused":
      return "vacation";
    case "skipped":
      return "onHold";
    case "off":
      return null;
    default: {
      const _never: never = status;
      return _never;
    }
  }
}

// Calendar day-dot color (a small filled circle under the day number).
export const DAY_STATUS_DOT_CLASS: Record<DayStatus, string> = {
  scheduled: "bg-ok",
  paused: "bg-muted-foreground/50",
  skipped: "bg-warn",
  locked: "bg-muted-foreground/30",
  makeup: "bg-blue-500",
  off: "bg-muted-foreground/15",
};

// Agenda-chip left status bar (c-calendar-22 pattern: a colored vertical bar, not a dot).
export const DAY_STATUS_BAR_CLASS: Record<DayStatus, string> = {
  scheduled: "after:bg-ok",
  paused: "after:bg-muted-foreground/50",
  skipped: "after:bg-warn",
  locked: "after:bg-muted-foreground/30",
  makeup: "after:bg-blue-500",
  off: "after:bg-muted-foreground/15",
};

// Tiffin-tile status UNDERLINE — colored dash beneath the day number (Akshayakalpa reference:
// green = delivered/past, blue = upcoming, yellow = vacation/pause, red = on hold/skipped).
export const DAY_STATUS_UNDERLINE_CLASS: Record<DayStatus, string> = {
  scheduled: "bg-blue-500",
  paused: "bg-warn",
  skipped: "bg-destructive",
  locked: "bg-ok",
  makeup: "bg-blue-500",
  off: "bg-transparent",
};

// CalendarCell-driven status (myCalendar's day cells carry a precomputed `locked` boolean rather
// than a raw cutoffAt epoch) — same precedence as deliveryDayStatus (makeup > locked > paused/
// skipped > scheduled), just keyed off the field the calendar surface actually has on hand.
export function calendarDayStatus(cell: { status: string; isMakeup: boolean; locked: boolean }): DayStatus {
  if (cell.isMakeup) return "makeup";
  if (cell.locked) return "locked";
  if (cell.status === "paused") return "paused";
  if (cell.status === "skipped") return "skipped";
  return "scheduled";
}
