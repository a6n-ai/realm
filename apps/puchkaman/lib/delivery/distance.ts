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
