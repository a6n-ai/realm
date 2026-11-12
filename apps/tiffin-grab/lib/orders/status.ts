import type { orders } from "@/db/schema";

export type OrderStatus = (typeof orders.status.enumValues)[number];

/** Delivering now (or paused mid-plan): reserves its days, counts as running, manageable schedule. */
export const RUNNING = ["active", "paused"] as const;
/** Running or about to start. */
export const ONGOING = ["pending", "active", "paused"] as const;
/** Anything that still holds a customer's plan slot, including a waitlisted one. */
export const LIVE = ["pending", "active", "waitlisted", "paused"] as const;
/** Starting soon or just started: the Orders "Starting soon" KPI and pill. */
export const STARTING_SOON = ["pending", "active", "waitlisted"] as const;
/** Every status except cancelled: the Orders "New orders" KPI and the Booked pill. */
export const BOOKED = ["pending", "active", "waitlisted", "paused", "completed"] as const;
/** Running, or finished with deliveries possibly still owed or renewable. */
export const RUNNING_OR_DONE = ["active", "paused", "completed"] as const;

export const inOrderStatuses = (list: readonly OrderStatus[], status: string | null | undefined) =>
  status != null && (list as readonly string[]).includes(status);
