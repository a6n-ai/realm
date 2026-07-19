// Plain module (no "use client"): pure day-status derivation, shared by the desktop
// calendar's day-dot slot, the mobile week strip, and the agenda/drawer body. Kept
// separate from calendar-constants.ts because DayStatus is a UI-only concept layered
// on top of DeliveryStatus + isMakeup + cutoff, not a value that ever round-trips
// through the DB or a server action.

export type DayStatus = "scheduled" | "paused" | "skipped" | "locked" | "makeup";

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
};

// Calendar day-dot color (a small filled circle under the day number).
export const DAY_STATUS_DOT_CLASS: Record<DayStatus, string> = {
  scheduled: "bg-ok",
  paused: "bg-muted-foreground/50",
  skipped: "bg-warn",
  locked: "bg-muted-foreground/30",
  makeup: "bg-blue-500",
};

// Agenda-chip left status bar (c-calendar-22 pattern: a colored vertical bar, not a dot).
export const DAY_STATUS_BAR_CLASS: Record<DayStatus, string> = {
  scheduled: "after:bg-ok",
  paused: "after:bg-muted-foreground/50",
  skipped: "after:bg-warn",
  locked: "after:bg-muted-foreground/30",
  makeup: "after:bg-blue-500",
};

// Tiffin-tile status RING (the day tile's border) — the calendar's signature "each day is its
// meal" surface reads status by the ring color around the dish photo itself, not a separate dot.
export const DAY_STATUS_RING_CLASS: Record<DayStatus, string> = {
  scheduled: "border-ok",
  paused: "border-muted-foreground/40",
  skipped: "border-warn",
  locked: "border-muted-foreground/25",
  makeup: "border-blue-500",
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
