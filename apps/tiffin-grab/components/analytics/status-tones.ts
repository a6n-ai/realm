import type { Tone } from "./chart-math";

export const ORDER_TONE: Record<string, Tone> = {
  active: "success",
  pending: "warning",
  waitlisted: "chart",
  paused: "muted",
  cancelled: "destructive",
  completed: "muted",
};

export const DELIVERY_TONE: Record<string, Tone> = {
  scheduled: "success",
  paused: "muted",
  skipped: "warning",
  cancelled: "destructive",
};
