import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries } from "@/db/schema";
import { coveredDates } from "./coverage";
import { parseIsoDateUtc } from "@foundry/commons";

export type Trip = typeof deliveries.$inferSelect;

function shift(iso: string, n: number): string {
  const d = parseIsoDateUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

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
    gte(deliveries.deliveryDate, shift(from, -7)),
    lte(deliveries.deliveryDate, shift(until, 7)),
  )).orderBy(asc(deliveries.deliveryDate));
  const out = new Map<string, Trip>();
  for (const trip of rows) {
    for (const date of coveredDates(trip)) {
      if (date >= from && date <= until && !out.has(date)) out.set(date, trip);
    }
  }
  return out;
}
