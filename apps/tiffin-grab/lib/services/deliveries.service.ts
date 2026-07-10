import { ValidationError, cutoffMsFor } from "@realm/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, deliveryFrequencies, orders } from "@/db/schema";
import { getAppSettings } from "./app-settings.service";
import { orderDeliveryDays } from "@/lib/menu/delivery-days";
import { subscriptionDeliveryDates } from "@/lib/menu/delivery-dates";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Order = typeof orders.$inferSelect;

const WEEKEND = new Set(["sat", "sun"]);

/**
 * Materializes the N delivery-drop rows for an order (N = durationWeeks × deliveryDays.length,
 * NOT tiffins — persons never multiplies row count). Idempotent: returns 0 and inserts nothing
 * if the order already has deliveries. Caller supplies the transaction; this is a write path
 * only, called from both routes that put an order into "active".
 */
export async function materializeDeliveries(tx: Tx, order: Order): Promise<number> {
  const [existing] = await tx.select({ id: deliveries.id }).from(deliveries)
    .where(eq(deliveries.orderId, order.id)).limit(1);
  if (existing) return 0;

  const [freq] = await tx.select({ key: deliveryFrequencies.key, daysPerWeek: deliveryFrequencies.daysPerWeek })
    .from(deliveryFrequencies).where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
  if (!freq) throw new ValidationError("Delivery frequency not found");

  const deliveryDays = orderDeliveryDays({
    frequencyKey: freq.key,
    includeSaturday: order.includeSaturday,
    includeSunday: order.includeSunday,
  });

  // orderDeliveryDays hardcodes 3 weekdays for "mwf" and 5 otherwise, independent of the
  // frequency row. If an admin edits daysPerWeek, pricing's tiffinCount and the row count
  // silently diverge — refuse to create a subscription whose rows contradict its price.
  const baseDays = deliveryDays.filter((d) => !WEEKEND.has(d)).length;
  if (baseDays !== freq.daysPerWeek) {
    throw new ValidationError(
      `Frequency "${freq.key}" declares ${freq.daysPerWeek} days/week but resolves to ${baseDays}`,
    );
  }

  const dates = subscriptionDeliveryDates({
    startDate: order.startDate,
    durationWeeks: order.durationWeeks,
    deliveryDays,
  });

  const { timezone, cutoffHour } = await getAppSettings();
  await tx.insert(deliveries).values(dates.map((d) => ({
    orderId: order.id,
    deliveryDate: d.dateIso,
    status: "scheduled" as const,
    cutoffAt: cutoffMsFor(d.dateIso, cutoffHour, timezone),
  })));
  return dates.length;
}
