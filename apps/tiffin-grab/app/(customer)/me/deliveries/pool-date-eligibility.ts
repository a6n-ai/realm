import type { TiffinCounts } from "@/lib/services/customer-deliveries.service";
import { carryTripDateIso } from "@/lib/menu/carry-trip";
import type { DayOfWeek } from "@/lib/menu/delivery-days";

const eatsOn = (iso: string, counts: TiffinCounts) => !counts.eatingWeekdays?.length || counts.eatingWeekdays.includes(isoWeekdayKey(iso));

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function isoWeekdayKey(iso: string): string {
  return WEEKDAY_KEYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;
}

/**
 * Pooled tiffins: customer picks an eating day. Eligibility uses the carrying trip
 * (weekends/off-pattern snap earlier). A new trip must land strictly after the last
 * delivery; merging onto an existing trip date is allowed when that date equals last
 * (server decides merge vs create).
 */
export function isPoolScheduleDateEligible(
  iso: string,
  counts: TiffinCounts,
  today: string,
): boolean {
  if (iso < today || !eatsOn(iso, counts)) return false;
  const weekdays = counts.deliveryWeekdays as DayOfWeek[];
  const carriedOn = carryTripDateIso(iso, weekdays);
  if (!carriedOn) return false;
  if (carriedOn < today) return false;
  const last = counts.lastDeliveryDate;
  // Allow eating days whose trip is on/after last — Sat after Fri last snaps to that Fri (merge).
  if (last && carriedOn < last) return false;
  return true;
}

export function isRescheduleTargetDateEligible(
  iso: string,
  counts: TiffinCounts,
  today: string,
): boolean {
  if (iso < today || !eatsOn(iso, counts)) return false;
  const weekdays = counts.deliveryWeekdays as DayOfWeek[];
  const carriedOn = carryTripDateIso(iso, weekdays);
  if (!carriedOn) return false;
  return carriedOn >= today;
}
