import { awsPlaceProvider, type AwsPlaceProviderOptions } from "./aws-provider";
import type { ResolvedPlace } from "./types";

export type { PlaceProvider, PlaceSuggestion, ResolvedPlace } from "./types";
export { resolvePlace } from "./resolve";
export { awsPlaceProvider } from "./aws-provider";
export { googlePlaceProvider } from "./google-provider";
export { nominatimProvider } from "./nominatim";

/**
 * Resolves and persists an address via AWS only — no Google, no fallback chain.
 * Persisting a Google-sourced geocode moves Google Places calls into the much
 * more expensive storage-licensed pricing tier, so any code path that writes
 * lat/lng to a database must go through this, not `resolvePlace`.
 */
export function resolveAndPersist(
  input: { placeId?: string; address: string },
  opts?: { region?: AwsPlaceProviderOptions["region"] },
): Promise<ResolvedPlace | null> {
  return awsPlaceProvider(opts).resolve({ ...input, persist: true });
}
