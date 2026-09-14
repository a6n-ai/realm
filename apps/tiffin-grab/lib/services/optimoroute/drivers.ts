import { desc, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries } from "@/db/schema";

// OptimoRoute exposes no driver-roster endpoint — the only place a driver's
// serial/name pair exists is on a route it has already planned, which
// pull.ts already writes into deliveries.routeDriverSerial/routeDriverName.
// This reads that back as a picklist instead of keeping a separate table
// that would just be a stale cache of the same information.
export type KnownDriver = { driverSerial: string; driverName: string | null };

export async function listKnownDrivers(): Promise<KnownDriver[]> {
  // Not selectDistinct on the pair: a renamed/corrected driver name would
  // then surface as two rows for the same serial, colliding as React keys
  // in the picklist. Sort newest-synced first and keep one row per serial
  // so a rename wins over the stale name instead of both surviving.
  const rows = await db
    .select({
      driverSerial: deliveries.routeDriverSerial,
      driverName: deliveries.routeDriverName,
    })
    .from(deliveries)
    .where(isNotNull(deliveries.routeDriverSerial))
    .orderBy(desc(deliveries.routeSyncedAt));

  const bySerial = new Map<string, KnownDriver>();
  for (const r of rows) {
    if (r.driverSerial == null) continue;
    if (!bySerial.has(r.driverSerial)) bySerial.set(r.driverSerial, { driverSerial: r.driverSerial, driverName: r.driverName });
  }

  return [...bySerial.values()].sort((a, b) => a.driverSerial.localeCompare(b.driverSerial));
}

export { assignDriver } from "./push";
