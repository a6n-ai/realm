import type { Tone } from "./chart-math";

export const ORDER_TONE: Record<string, Tone> = {
  active: "c1",
  pending: "c2",
  waitlisted: "c3",
  paused: "c4",
  cancelled: "c5",
  completed: "muted",
};

export const DELIVERY_TONE: Record<string, Tone> = {
  scheduled: "c1",
  paused: "c4",
  skipped: "c2",
  cancelled: "muted",
};
