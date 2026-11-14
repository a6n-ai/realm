import { isCutoffPassed } from "@/lib/dates/cutoff";

/** Words on the Deliveries section. Same words as the order page. */
export const LABEL_STATUS = {
  toBeDelivered: "To be delivered",
  awaitingConfirmation: "Awaiting confirmation",
  delivered: "Delivered",
  onHold: "On hold",
  notDelivered: "Not delivered",
  paused: "Paused",
  holiday: "Holiday",
  cancelled: "Cancelled",
} as const;

export type LabelDeliveryStatus = (typeof LABEL_STATUS)[keyof typeof LABEL_STATUS];

const GOING_OUT: ReadonlySet<string> = new Set([LABEL_STATUS.toBeDelivered, LABEL_STATUS.awaitingConfirmation, LABEL_STATUS.delivered]);

/** Deliveries that leave the kitchen. Held, paused and cancelled rows stay on the list but are not stops. */
export const isGoingOut = (d: { status: string }): boolean => GOING_OUT.has(d.status);

/**
 * Scheduled with no driver confirmation is To be delivered before cutoff and Awaiting confirmation
 * after it; only an OptimoRoute success (or admin) makes it Delivered. A skipped day is "On hold" (staff or the customer held it; the tiffin went
 * to their pool) unless OptimoRoute reported the drop failed — only then "Not delivered".
 * Paused, holiday and cancelled keep their own words.
 */
export function labelDeliveryStatus(
  row: { status: "scheduled" | "paused" | "skipped" | "cancelled"; cutoffAt: number; optimoCompletionStatus: string | null; holidayId?: bigint | null },
  now: number,
): LabelDeliveryStatus {
  // Closed by a holiday, whatever happened to the row since: staff must not read it as a customer pause or a hold.
  if (row.holidayId != null && row.status !== "scheduled" && row.status !== "cancelled") return LABEL_STATUS.holiday;
  switch (row.status) {
    case "paused":
      return LABEL_STATUS.paused;
    case "skipped":
      return row.optimoCompletionStatus === "failed" ? LABEL_STATUS.notDelivered : LABEL_STATUS.onHold;
    case "cancelled":
      return LABEL_STATUS.cancelled;
    case "scheduled":
      if (row.optimoCompletionStatus === "success") return LABEL_STATUS.delivered;
      // Past the cutoff the kitchen has it, but only OptimoRoute or an admin confirms it went out.
      return isCutoffPassed(row.cutoffAt, now) ? LABEL_STATUS.awaitingConfirmation : LABEL_STATUS.toBeDelivered;
    default: {
      const unreachable: never = row.status;
      return unreachable;
    }
  }
}
