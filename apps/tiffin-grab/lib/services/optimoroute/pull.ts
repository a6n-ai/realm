import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries } from "@/db/schema";
import { getRoutes } from "./client";
import { getOptimoRouteConfig } from "./config";

// The half that makes the integration worth having: OptimoRoute plans the routes, and we
// read its answer back so labels print in the order the van is loaded. Nothing here
// decides an assignment — it only records one.

export type PulledStop = {
  deliveryPublicId: string;
  driverSerial: string | null;
  driverName: string | null;
  driverCode: string | null;
  stopNumber: number | null;
};

export type PullResult = {
  date: string;
  /** Stops matched to one of our deliveries and stored. */
  matched: number;
  /** Deliveries that previously had a route but are no longer on one — cleared. */
  cleared: number;
  /** OptimoRoute stops we could not match: orders created outside this app. */
  unknownOrderNos: string[];
  stops: PulledStop[];
};

/**
 * Display code for a driver. Config maps driverSerial → "D4"; otherwise the driver's name
 * is used as-is.
 *
 * Deliberately NOT derived from digits in the name, the way the Route Maker spreadsheet
 * does it: OptimoRoute auto-names nothing, so "Driver 4" is a hand-typed string. Rename
 * that driver and a name-derived code silently re-sorts every label.
 */
export function driverCodeFor(
  codes: Record<string, string>,
  serial: string | null,
  name: string | null,
): string | null {
  if (serial && codes[serial]) return codes[serial];
  return name ?? serial ?? null;
}

export async function pullRoutes(date: string): Promise<PullResult> {
  const [routes, cfg] = await Promise.all([getRoutes(date), getOptimoRouteConfig()]);

  const stops: PulledStop[] = [];
  for (const route of routes) {
    for (const stop of route.stops ?? []) {
      const orderNo = stop.orderNo?.trim();
      if (!orderNo || orderNo === "-") continue;
      // Real data: the shared account has a route with driverSerial "" — store null, or
      // "" becomes a distinct driver key that never matches a config code.
      const serial = route.driverSerial?.trim() || null;
      const name = route.driverName?.trim() || null;
      stops.push({
        deliveryPublicId: orderNo,
        driverSerial: serial,
        driverName: name,
        driverCode: driverCodeFor(cfg.driverCodes, serial, name),
        stopNumber: stop.stopNumber ?? null,
      });
    }
  }

  const ours =
    stops.length === 0
      ? []
      : await db
          .select({ id: deliveries.id, publicId: deliveries.publicId })
          .from(deliveries)
          .where(inArray(deliveries.publicId, stops.map((s) => s.deliveryPublicId)));
  const idByPublicId = new Map(ours.map((r) => [r.publicId, r.id]));

  const now = Date.now();
  const matchedIds: bigint[] = [];
  const unknownOrderNos: string[] = [];

  for (const stop of stops) {
    const id = idByPublicId.get(stop.deliveryPublicId);
    if (id == null) {
      // A stop OptimoRoute has that we did not create — another source, or an order left
      // over from the spreadsheet's "43 Yatharth Aggarwal" scheme.
      unknownOrderNos.push(stop.deliveryPublicId);
      continue;
    }
    await db
      .update(deliveries)
      .set({
        routeDriverSerial: stop.driverSerial,
        routeDriverName: stop.driverName,
        routeStopNumber: stop.stopNumber,
        routeSyncedAt: now,
      })
      .where(eq(deliveries.id, id));
    matchedIds.push(id);
  }

  // A delivery pulled off a route (re-planned, or removed) must lose its stale assignment,
  // or labels keep printing it into a van that is no longer going there.
  const staleRows = await db
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(and(eq(deliveries.deliveryDate, date), isNotNull(deliveries.routeSyncedAt)));
  const stale = staleRows.map((r) => r.id).filter((id) => !matchedIds.includes(id));

  if (stale.length > 0) {
    await db
      .update(deliveries)
      .set({
        routeDriverSerial: null,
        routeDriverName: null,
        routeStopNumber: null,
        routeSyncedAt: null,
      })
      .where(inArray(deliveries.id, stale));
  }

  return {
    date,
    matched: matchedIds.length,
    cleared: stale.length,
    unknownOrderNos,
    stops: stops.filter((s) => idByPublicId.has(s.deliveryPublicId)),
  };
}
