import { db } from "@/db/client";
import { deliveryFrequencies } from "@/db/schema";
import { customFrequencyKey, type DayOfWeek } from "@/lib/menu/delivery-days";

/**
 * Idempotent: inserts the catalog row for a custom weekday pattern the first
 * time it's seen (0% discount — an ad-hoc customer pick, not an admin
 * reference pattern with its own discount), no-ops on every later order that
 * shares the same pattern. Shared by createOrder (live wizard/agent checkout)
 * and the legacy-WordPress import script — the two are the only writers of
 * ad-hoc "custom_*" frequency rows, so a fix here covers both.
 */
export async function ensureCustomFrequencyRow(weekdays: DayOfWeek[]): Promise<void> {
  const key = customFrequencyKey(weekdays);
  await db
    .insert(deliveryFrequencies)
    .values({
      key,
      name: `Custom (${weekdays.join("/")})`,
      daysPerWeek: weekdays.length,
      weekdays,
      courierDiscountPct: 0,
      active: true,
    })
    .onConflictDoNothing({ target: deliveryFrequencies.key });
}
