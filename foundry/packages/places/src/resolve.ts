import type { PlaceProvider, ResolvedPlace } from "./types";

/**
 * First provider to return a hit wins. A provider that throws is treated as a
 * miss — a geocoding outage must never take checkout down, which is why this
 * swallows rather than propagates.
 */
export async function resolvePlace(
  providers: PlaceProvider[],
  input: { placeId?: string; address: string; persist: boolean },
): Promise<ResolvedPlace | null> {
  for (const provider of providers) {
    try {
      const hit = await provider.resolve(input);
      if (hit) return hit;
    } catch {
      // fall through to the next provider
    }
  }
  return null;
}
