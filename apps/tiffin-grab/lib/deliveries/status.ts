import { RUNNING, inOrderStatuses } from "@/lib/orders/status";

export type DeliveryStatus = "delivered" | "upcoming" | "paused" | "hold" | "combined" | "holiday";

/** Default wording. A surface that says it differently (staff calendar, menu day) overrides explicitly. */
export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  delivered: "Delivered",
  upcoming: "Upcoming",
  paused: "Paused",
  hold: "Not delivered",
  combined: "Combined",
  holiday: "Holiday",
};

export const STATUS_COLOR: Record<DeliveryStatus, string> = {
  delivered: "var(--s-delivered,#10b981)",
  upcoming: "var(--s-upcoming,#0ea5e9)",
  paused: "var(--s-vac,#d98a00)",
  hold: "var(--s-hold,#f43f5e)",
  combined: "var(--muted-foreground,#6E6558)",
  // Slate: not one of the plan colours on the week strip (PLAN_COLORS), and the word "Holiday" carries the meaning anyway.
  holiday: "var(--s-holiday,#475569)",
};

export const STATUS_TONE: Record<DeliveryStatus, "ok" | "up" | "hold" | "vac" | "neutral"> = {
  delivered: "ok",
  upcoming: "up",
  paused: "vac",
  hold: "hold",
  combined: "neutral",
  holiday: "neutral",
};

type StateInput = {
  /** deliveries.status; typed loosely so rows from DB, agenda dots and menu rows all fit. */
  status: string;
  holiday?: string | null;
  moved?: boolean;
  /** A hold that began as a pause: still drawn as Paused. */
  lapsedPause?: boolean;
  optimoCompletionStatus?: string | null;
};

/**
 * What one delivery day is, as the customer sees it (six states). Staff wording lives in label-status.ts
 * (labelDeliveryStatus) and the trip strip's finer states in deliveries-view buildTrips; they read the same
 * columns but disagree at the edges (see the disagreement test).
 */
export function deliveryTripState(d: StateInput): DeliveryStatus {
  if (d.holiday) return "holiday";
  if (d.moved) return "combined";
  if (d.status === "paused") return "paused";
  if (d.status === "skipped") return d.lapsedPause ? "paused" : "hold";
  if (d.optimoCompletionStatus === "failed") return "hold";
  if (d.optimoCompletionStatus === "success") return "delivered";
  // Not confirmed by OptimoRoute or an admin yet, whatever the cutoff says.
  return "upcoming";
}

/** A plan that still has days to deliver (the delivery schedule is manageable). */
export const isLiveOrder = (status: string) => inOrderStatuses(RUNNING, status);
