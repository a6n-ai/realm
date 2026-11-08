import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries } from "@/db/schema";
import { coveredDates } from "./coverage";
import { addDaysIso } from "@/lib/dates";

export type Trip = typeof deliveries.$inferSelect;

/**
 * Eating date -> the scheduled trip that carries it, for eating dates in [from, until]. A trip's
 * covered days can sit either side of its own delivery date (Wed [Mon..Thu] after a merge), so the
 * trip window is padded. Merged-source rows are excluded: their tiffins live on the merge target.
 */
export async function carryingTrips(orderId: bigint, from: string, until: string): Promise<Map<string, Trip>> {
  const rows = await db.select().from(deliveries).where(and(
    eq(deliveries.orderId, orderId),
    eq(deliveries.status, "scheduled"),
    isNull(deliveries.mergedIntoDeliveryId),
    gte(deliveries.deliveryDate, addDaysIso(from, -7)),
    lte(deliveries.deliveryDate, addDaysIso(until, 7)),
  )).orderBy(asc(deliveries.deliveryDate));
  const out = new Map<string, Trip>();
  for (const trip of rows) {
    for (const date of coveredDates(trip)) {
      if (date >= from && date <= until && !out.has(date)) out.set(date, trip);
    }
  }
  return out;
}
