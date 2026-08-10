/**
 * How far out a scheduled delivery may be booked. The kitchen assembles to
 * order and plans a day at a time, so a slot a week away is a promise nobody
 * has the stock to keep.
 *
 * Shared by the checkout form (which bounds the picker) and createCheckout
 * (which enforces it — the client's bounds are a convenience, not the rule).
 */
export const SCHEDULE_MAX_AHEAD_MS = 24 * 60 * 60 * 1000;

/** Earliest bookable slot: enough runway for the kitchen to make it. */
export const SCHEDULE_MIN_AHEAD_MS = 60 * 60 * 1000;

export const SCHEDULE_WINDOW_MESSAGE =
  "Scheduled delivery can only be booked up to 24 hours ahead.";

/**
 * The one place the window is judged, so the form and createCheckout cannot
 * drift apart. Returns the customer-facing reason, or null when the slot is
 * bookable.
 */
export function scheduleWindowError(scheduledFor: string, now = Date.now()): string | null {
  const at = new Date(scheduledFor).getTime();
  if (Number.isNaN(at) || at <= now) return "Pick a delivery time in the future.";
  if (at > now + SCHEDULE_MAX_AHEAD_MS) return SCHEDULE_WINDOW_MESSAGE;
  return null;
}
