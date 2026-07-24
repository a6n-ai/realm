import type { TiffinCounts } from "@/lib/services/customer-deliveries.service";
import { weekdayKey } from "@realm/commons";
import { toIsoLocal } from "./calendar-constants";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function isoWeekdayKey(iso: string): string {
  return WEEKDAY_KEYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;
}

/** Pooled tiffins may land on plan weekdays strictly after the last delivery. */
export function isPoolScheduleDateEligible(
  iso: string,
  counts: TiffinCounts,
  today: string,
): boolean {
  if (iso < today) return false;
  const last = counts.lastDeliveryDate;
  if (last && iso <= last) return false;
  return counts.deliveryWeekdays.includes(isoWeekdayKey(iso));
}

export function isPoolScheduleDateEligibleFromDate(
  date: Date,
  counts: TiffinCounts,
  today: string,
): boolean {
  return isPoolScheduleDateEligible(toIsoLocal(date), counts, today);
}
