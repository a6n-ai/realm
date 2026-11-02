import type { Tone } from "./chart-math";

// One rule on every status donut: good outcome green, bad outcome red, needs action amber,
// finished/neutral muted, in-between states take the non-orange categorical slots (c2..c5).
export const ORDER_TONE: Record<string, Tone> = {
  active: "success",
  pending: "warning",
  waitlisted: "c3",
  paused: "c4",
  cancelled: "destructive",
  completed: "muted",
};

export const DELIVERY_TONE: Record<string, Tone> = {
  scheduled: "success",
  paused: "c4",
  skipped: "warning",
  cancelled: "destructive",
};
