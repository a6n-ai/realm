import type { orders } from "@/db/schema";

export type OrderStatus = (typeof orders.status.enumValues)[number];

/** Delivering now (or paused mid-plan): reserves its days, counts as running, manageable schedule. */
export const RUNNING = ["active", "paused"] as const;
/** Running or about to start. */
export const ONGOING = ["pending", "active", "paused"] as const;
/** Anything that still holds a customer's plan slot, including a waitlisted one. */
export const LIVE = ["pending", "active", "waitlisted", "paused"] as const;
/** LIVE as customer surfaces show it: a display status, where unsettled money reads payment_review. */
export const LIVE_DISPLAY = [...LIVE, "payment_review"] as const;
/** Starting soon or just started: the Orders "Starting soon" KPI and pill. */
export const STARTING_SOON = ["pending", "active", "waitlisted"] as const;
/** Finished for good: no more deliveries, nothing to start or edit. */
export const ENDED = ["cancelled", "completed"] as const;
/** Not delivering yet: awaiting payment or a free slot. */
export const UNSTARTED = ["pending", "waitlisted"] as const;
/** Every status except cancelled: the Orders "New orders" KPI and the Booked pill. */
export const BOOKED = ["pending", "active", "waitlisted", "paused", "completed"] as const;
/** Running, or finished with deliveries possibly still owed or renewable. */
export const RUNNING_OR_DONE = ["active", "paused", "completed"] as const;

export const inOrderStatuses = (list: readonly (OrderStatus | "payment_review")[], status: string | null | undefined) =>
  status != null && (list as readonly string[]).includes(status);
