import { DELIVERY_TONE } from "@/components/analytics/status-tones";
import type { DayDeliveryStatusRow } from "@/lib/services/daily-labels.service";

type Group = keyof typeof DELIVERY_TONE;

/** Dispatch's day labels folded into the four statuses the delivery donuts use. */
const GROUP: Record<DayDeliveryStatusRow["status"], Group> = {
  "To be delivered": "scheduled",
  "Awaiting confirmation": "scheduled",
  Delivered: "scheduled",
  Paused: "paused",
  "On hold": "skipped",
  "Not delivered": "skipped",
  Holiday: "skipped",
  Cancelled: "cancelled",
};

export const GROUP_LABEL: Record<Group, string> = { scheduled: "Scheduled", paused: "Paused", skipped: "On hold", cancelled: "Cancelled" };

export const deliveryGroup = (r: Pick<DayDeliveryStatusRow, "status">): Group => GROUP[r.status];
export const isScheduledStop = (r: Pick<DayDeliveryStatusRow, "status">) => deliveryGroup(r) === "scheduled";
