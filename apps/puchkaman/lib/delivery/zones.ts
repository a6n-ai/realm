/**
 * A concentric delivery ring measured from the shop. Numbers are plain JS
 * numbers here — the DB stores numerics as strings, so the service layer
 * converts on read.
 */
export type Zone = {
  /** DB row id, when this Zone came from a query that selected it — used to
   * stamp `orders.delivery_zone_id`. Absent on hand-built test fixtures. */
  id?: bigint;
  name: string;
  radiusKm: number;
  feeAmount: number;
  discountPct: number;
  minSubtotal: number;
  requiresScheduling: boolean;
  active: boolean;
};

/**
 * Smallest active zone whose radius covers the distance; null means out of
 * range and the order is refused. Smallest-wins is what lets a cheap inner
 * ring sit inside a more expensive outer one.
 */
export function matchZone(distanceKm: number, zones: Zone[]): Zone | null {
  return (
    zones
      .filter((z) => z.active && distanceKm <= z.radiusKm)
      .sort((a, b) => a.radiusKm - b.radiusKm)[0] ?? null
  );
}

/** The furthest we deliver — shown to customers we turn away. Null when no zone is active. */
export function deliveryLimitKm(zones: Zone[]): number | null {
  const radii = zones.filter((z) => z.active).map((z) => z.radiusKm);
  return radii.length ? Math.max(...radii) : null;
}

/** A delivery option and its rules. Rules live on the type, geography on the zone. */
export type DeliveryType = {
  key: string;
  label: string;
  requiresAddress: boolean;
  requiresSchedule: boolean;
  minSubtotal: number;
  discountPct: number;
  sortOrder: number;
  active: boolean;
};

export type ZoneWithTypes = Zone & { types: DeliveryType[] };

/**
 * Every active type offered by every active zone covering this distance, deduplicated by key
 * and ordered by sortOrder. Empty means no delivery here — the caller offers pickup instead.
 */
export function availableTypes(distanceKm: number, zones: ZoneWithTypes[]): DeliveryType[] {
  const byKey = new Map<string, DeliveryType>();
  for (const zone of zones) {
    if (!zone.active || distanceKm > zone.radiusKm) continue;
    for (const type of zone.types) {
      if (type.active && !byKey.has(type.key)) byKey.set(type.key, type);
    }
  }
  return [...byKey.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Smallest active zone covering this distance that offers the given type. */
export function zoneForType(
  distanceKm: number,
  typeKey: string,
  zones: ZoneWithTypes[],
): Zone | null {
  return (
    zones
      .filter((z) => z.active && distanceKm <= z.radiusKm)
      .filter((z) => z.types.some((t) => t.active && t.key === typeKey))
      .sort((a, b) => a.radiusKm - b.radiusKm)[0] ?? null
  );
}
