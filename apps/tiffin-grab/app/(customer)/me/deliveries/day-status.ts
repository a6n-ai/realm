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

export const LEGEND_MARK_CLASS: Record<CalendarLegendKey, string> = {
  delivered: "bg-emerald-500",
  upcoming: "bg-sky-500",
  vacation: "bg-orange-500",
  onHold: "bg-rose-500",
};

// Date-number ring for cutoff-passed (legend: Delivered) days — same emerald as the dash,
// used instead of a padlock so the tile matches Upcoming / Vacation / On Hold language.
export const DELIVERED_DATE_RING_CLASS = "ring-2 ring-emerald-500 ring-offset-1 ring-offset-background";

export const CALENDAR_LEGEND: { key: CalendarLegendKey; label: string; dashClass: string }[] = [
  { key: "delivered", label: "Delivered", dashClass: LEGEND_MARK_CLASS.delivered },
  { key: "upcoming", label: "Upcoming", dashClass: LEGEND_MARK_CLASS.upcoming },
  { key: "vacation", label: "Vacation", dashClass: LEGEND_MARK_CLASS.vacation },
  { key: "onHold", label: "On Hold", dashClass: LEGEND_MARK_CLASS.onHold },
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

export function calendarLegendLabel(status: DayStatus): string | null {
  const key = calendarLegendKey(status);
  if (!key) return null;
  return CALENDAR_LEGEND.find((item) => item.key === key)?.label ?? null;
}

function markFor(status: DayStatus): string {
  const key = calendarLegendKey(status);
  return key ? LEGEND_MARK_CLASS[key] : "bg-transparent";
}

// Same four colors as the legend, on every calendar surface — dots, agenda bars, tile marks.
export const DAY_STATUS_DOT_CLASS: Record<DayStatus, string> = {
  scheduled: LEGEND_MARK_CLASS.upcoming,
  paused: LEGEND_MARK_CLASS.vacation,
  skipped: LEGEND_MARK_CLASS.onHold,
  locked: LEGEND_MARK_CLASS.delivered,
  makeup: LEGEND_MARK_CLASS.upcoming,
  off: "bg-transparent",
};

export const DAY_STATUS_BAR_CLASS: Record<DayStatus, string> = {
  scheduled: "after:bg-sky-500",
  paused: "after:bg-orange-500",
  skipped: "after:bg-rose-500",
  locked: "after:bg-emerald-500",
  makeup: "after:bg-sky-500",
  off: "after:bg-transparent",
};

export const DAY_STATUS_UNDERLINE_CLASS: Record<DayStatus, string> = {
  scheduled: markFor("scheduled"),
  paused: markFor("paused"),
  skipped: markFor("skipped"),
  locked: markFor("locked"),
  makeup: markFor("makeup"),
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
