import { parseIsoDateUtc } from "@realm/commons";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries } from "@/db/schema";
import type { Tx } from "./deliveries.service";

export type OrderWindow = { id: bigint; startDate: string; durationWeeks: number };

/**
 * The calendar band an active/paused order actually reserves, keyed by order id, as an
 * exclusive end date (the first day NOT reserved).
 *
 * Prefers the true last materialized delivery date over the naive
 * `startDate + durationWeeks * 7` calculation: pooled/rescheduled tiffins can push real
 * delivery dates later than that naive window (see `TiffinCounts.lastDeliveryDate` in
 * customer-deliveries.service.ts, which this mirrors), so an order whose deliveries have
 * shifted later still reserves through its true last delivery, not just its original
 * calendar window. The naive calc is only a fallback for an order with no delivery rows
 * yet — shouldn't happen for an already-active/paused order, but keeps this safe.
 */
export async function reservedEndDatesExclusive(
  tx: Tx | typeof db,
  orderWindows: OrderWindow[],
): Promise<Map<string, Date>> {
  const result = new Map<string, Date>();
  if (orderWindows.length === 0) return result;

  const orderIds = orderWindows.map((o) => o.id);
  const lastDeliveryRows = await tx
    .select({ orderId: deliveries.orderId, lastDeliveryDate: sql<string>`max(${deliveries.deliveryDate})` })
    .from(deliveries)
    .where(inArray(deliveries.orderId, orderIds))
    .groupBy(deliveries.orderId);
  const lastDeliveryByOrder = new Map(lastDeliveryRows.map((r) => [r.orderId.toString(), r.lastDeliveryDate]));

  for (const o of orderWindows) {
    const naiveEnd = parseIsoDateUtc(o.startDate);
    naiveEnd.setUTCDate(naiveEnd.getUTCDate() + o.durationWeeks * 7);

    const lastDelivery = lastDeliveryByOrder.get(o.id.toString());
    if (lastDelivery) {
      const fromDelivery = parseIsoDateUtc(lastDelivery);
      fromDelivery.setUTCDate(fromDelivery.getUTCDate() + 1);
      result.set(o.id.toString(), fromDelivery > naiveEnd ? fromDelivery : naiveEnd);
    } else {
      result.set(o.id.toString(), naiveEnd);
    }
  }
  return result;
}
