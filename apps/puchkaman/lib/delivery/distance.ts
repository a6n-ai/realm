// Store location (3315 Danforth Ave, Scarborough, ON) — reused from the
// geocoded coords already baked into the /contact map embed (lib/links.ts).
// Fallback when `app.storeLat`/`storeLng` are unset.
export const DEFAULT_STORE_LAT = 43.69234;
export const DEFAULT_STORE_LNG = -79.28251;

/** Great-circle distance between two lat/lng points, in kilometers. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Inverse of haversineKm: the point `distanceKm` away from a start point along
 * a compass `bearingDeg` (0 = north, 90 = east). Used to draw zone rings as
 * geodesic polygons and to place their drag handles — MapLibre has no circle
 * primitive, so a ring is a polygon we generate ourselves.
 *
 * Kept alongside haversineKm deliberately: the two must share a globe. A ring
 * drawn on a different earth radius than the one the server measures distance
 * with would show a customer inside a zone the server puts outside it.
 */
export function destinationPoint(
  lat: number,
  lng: number,
  distanceKm: number,
  bearingDeg: number,
): { lat: number; lng: number } {
  const R = 6371;
  const toRad = Math.PI / 180;
  const angular = distanceKm / R;
  const bearing = bearingDeg * toRad;
  const lat1 = lat * toRad;
  const lng1 = lng * toRad;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );

  // Normalise longitude to [-180, 180] so a ring near the antimeridian doesn't
  // produce coordinates MapLibre renders as a stripe across the whole world.
  return { lat: lat2 / toRad, lng: (((lng2 / toRad + 540) % 360) - 180) };
}
