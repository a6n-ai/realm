import { DELIVERY_TONE } from "@/components/analytics/status-tones";
import { LABEL_STATUS as S } from "@/lib/deliveries/label-status";
import type { DayDeliveryStatusRow } from "@/lib/deliveries/day-deliveries";

type Group = keyof typeof DELIVERY_TONE;

/** Dispatch's day labels folded into the four statuses the delivery donuts use. */
const GROUP: Record<DayDeliveryStatusRow["status"], Group> = {
  [S.toBeDelivered]: "scheduled",
  [S.awaitingConfirmation]: "scheduled",
  [S.delivered]: "scheduled",
  [S.paused]: "paused",
  [S.onHold]: "skipped",
  [S.notDelivered]: "skipped",
  [S.holiday]: "skipped",
  [S.cancelled]: "cancelled",
};

export const GROUP_LABEL: Record<Group, string> = { scheduled: "Scheduled", paused: "Paused", skipped: "On hold", cancelled: "Cancelled" };

export const deliveryGroup = (r: Pick<DayDeliveryStatusRow, "status">): Group => GROUP[r.status];
