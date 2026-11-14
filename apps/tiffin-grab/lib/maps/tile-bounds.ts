/**
 * Validate a tile request against the real tile-pyramid bounds, not a digit
 * count: a digit cap rejects valid tiles above zoom 9 and the map renders blank.
 *
 * Lives outside the route so it can be tested without invoking the handler.
 */
export const MAX_TILE_ZOOM = 22;

export function isValidTile(z: string, x: string, y: string): boolean {
  if (!/^\d{1,2}$/.test(z) || !/^\d{1,7}$/.test(x) || !/^\d{1,7}$/.test(y)) return false;
  const zoom = Number(z);
  if (zoom > MAX_TILE_ZOOM) return false;
  const limit = 2 ** zoom;
  return Number(x) < limit && Number(y) < limit;
}
