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
