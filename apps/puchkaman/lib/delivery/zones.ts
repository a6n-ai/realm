/**
 * A concentric delivery ring measured from the shop. Numbers are plain JS
 * numbers here — the DB stores numerics as strings, so the service layer
 * converts on read.
 */
export type Zone = {
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
