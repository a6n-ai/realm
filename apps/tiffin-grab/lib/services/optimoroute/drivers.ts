import { isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries } from "@/db/schema";

// OptimoRoute exposes no driver-roster endpoint — the only place a driver's
// serial/name pair exists is on a route it has already planned, which
// pull.ts already writes into deliveries.routeDriverSerial/routeDriverName.
// This reads that back as a picklist instead of keeping a separate table
// that would just be a stale cache of the same information.
export type KnownDriver = { driverSerial: string; driverName: string | null };

export async function listKnownDrivers(): Promise<KnownDriver[]> {
  const rows = await db
    .selectDistinct({
      driverSerial: deliveries.routeDriverSerial,
      driverName: deliveries.routeDriverName,
    })
    .from(deliveries)
    .where(isNotNull(deliveries.routeDriverSerial));

  // routeDriverSerial is NOT NULL by the where clause, but the column type is
  // nullable — narrow it so callers don't have to.
  return rows
    .filter((r): r is KnownDriver => r.driverSerial != null)
    .sort((a, b) => a.driverSerial.localeCompare(b.driverSerial));
}

export { assignDriver } from "./push";
