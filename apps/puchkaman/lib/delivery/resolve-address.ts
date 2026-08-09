import {
  awsPlaceProvider,
  googlePlaceProvider,
  nominatimProvider,
  resolvePlace,
  type PlaceProvider,
  type PlaceSuggestion,
  type ResolvedPlace,
} from "@realm/places";

export type ResolvedAddress = ResolvedPlace;

// PLACES_PROVIDER picks which paid provider goes first; the other paid
// provider and Nominatim follow as fallback so a single vendor outage
// degrades checkout instead of blocking it. Default (unset) keeps Google
// primary — Task 5 decides whether AWS's Canadian subpremise data is good
// enough to flip this.
function buildProviders(): PlaceProvider[] {
  const aws = awsPlaceProvider({ region: process.env.AWS_REGION });
  const google = googlePlaceProvider();
  const nominatim = nominatimProvider();
  return process.env.PLACES_PROVIDER === "aws" ? [aws, google, nominatim] : [google, aws, nominatim];
}

const providers = buildProviders();

/**
 * The only way coordinates enter the system. A client-supplied place_id/address
 * is resolved server-side so a client can never assert its own lat/lng — distance
 * from here decides a discount and a delivery fee.
 *
 * `persist: false` — the mid-cost bucket, for advisory checks (the public "do we
 * deliver here?" check) that store nothing. Use `resolveAddressForStorage` for
 * anything written to the database.
 */
export async function resolveAddress(input: { placeId?: string; address: string }): Promise<ResolvedAddress | null> {
  return resolvePlace(providers, { ...input, persist: false });
}

/**
 * Same resolution, `persist: true` — AWS's storage-licensed bucket (~8x Core),
 * required whenever the result is written to a database. Use only where
 * coordinates are persisted (currently: order creation's delivery_lat/delivery_lng).
 */
export async function resolveAddressForStorage(input: {
  placeId?: string;
  address: string;
}): Promise<ResolvedAddress | null> {
  return resolvePlace(providers, { ...input, persist: true });
}

/**
 * Cheapest bucket — typeahead, fires on every keystroke. First provider with a
 * non-empty result wins; Nominatim never has anything to offer here (it isn't
 * a typeahead service) so it's a harmless no-op at the end of the chain.
 */
export async function suggestAddresses(query: string): Promise<PlaceSuggestion[]> {
  for (const provider of providers) {
    const hits = await provider.suggest(query);
    if (hits.length > 0) return hits;
  }
  return [];
}
