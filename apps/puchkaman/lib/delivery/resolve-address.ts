import { createLogger } from "@foundry/commons/logger";
import {
  awsPlaceProvider,
  googlePlaceProvider,
  nominatimProvider,
  resolvePlace,
  type PlaceProvider,
  type PlaceSuggestion,
  type ResolvedPlace,
} from "@foundry/places";
import { DEFAULT_STORE_LAT, DEFAULT_STORE_LNG } from "./distance";

const log = createLogger("delivery-address");

export type ResolvedAddress = ResolvedPlace;

// PLACES_PROVIDER picks which paid provider goes first; the other paid
// provider and Nominatim follow as fallback so a single vendor outage
// degrades checkout instead of blocking it. Default (unset) keeps Google
// primary — Task 5 decides whether AWS's Canadian subpremise data is good
// enough to flip this. Used for the advisory buckets only (suggest, and
// resolve with persist: false) — see buildStorageProviders below for why
// the storage bucket is a separate, shorter chain.
function buildAdvisoryProviders(): PlaceProvider[] {
  const aws = awsPlaceProvider({ region: process.env.AWS_REGION });
  const google = googlePlaceProvider();
  const nominatim = nominatimProvider();
  return process.env.PLACES_PROVIDER === "aws" ? [aws, google, nominatim] : [google, aws, nominatim];
}

// No storage chain exists here on purpose. Lat/lng IS persisted now — orders
// has deliveryLat/deliveryLng — but only via the AWS-only resolveAndPersist
// path in app/api/checkout/route.ts, at the actual checkout write point.
// This file's resolveAddress()/suggestAddresses() stay advisory-only
// (persist: false) and never write anything; they can safely include Google,
// because Google can never sit in a storage chain — Places API (New) has no
// storage-licensed bucket at any price.

// Built lazily, not at module load — awsPlaceProvider() constructs a real
// GeoPlacesClient even when PLACES_PROVIDER never selects AWS. SDK v3 defers
// credential/network work until the first .send(), so building it eagerly
// isn't billable, but doing costly-looking work at import time rather than on
// first use is the same eagerness pattern that made an earlier test build a
// real AWS client unexpectedly — mirrors the memoised-client pattern already
// in aws-provider.ts's getSharedClient().
let advisoryProviders: PlaceProvider[] | null = null;
function getAdvisoryProviders(): PlaceProvider[] {
  if (!advisoryProviders) advisoryProviders = buildAdvisoryProviders();
  return advisoryProviders;
}

// Fires once per process, not once per request — a missing key otherwise
// produces total silence (only AWS's per-request error path logs anything;
// Google returns [] unlogged, Nominatim never does suggest at all), which
// left checkout's address dropdown dead with nothing pointing at why.
let warnedNoSuggestProvider = false;
function warnIfNoSuggestProviderConfigured(): void {
  if (warnedNoSuggestProvider) return;
  // Region is the pragmatic env-based signal for "AWS is set up" — actual
  // credentials are usually ambient (IAM role) and not directly observable here.
  if (process.env.AWS_REGION || process.env.GOOGLE_PLACES_API_KEY) return;
  warnedNoSuggestProvider = true;
  log.warn(
    "no address-suggest provider is configured — AWS_REGION and GOOGLE_PLACES_API_KEY are both unset, so checkout's address dropdown will silently return no suggestions",
  );
}

// Old browser widget restricted to Canada and biased toward the shop with a
// bounds box; the server-side port lost both. DEFAULT_STORE_LAT/LNG (not the
// admin-configured store origin) are the right call here — suggest fires on
// every keystroke, and a per-keystroke DB read to fetch the real origin isn't
// worth it for a bias hint.
const SUGGEST_OPTS = { country: "CA", near: { lat: DEFAULT_STORE_LAT, lng: DEFAULT_STORE_LNG } };

/**
 * The only way coordinates enter the system. A client-supplied place_id/address
 * is resolved server-side so a client can never assert its own lat/lng — distance
 * from here decides a discount and a delivery fee.
 *
 * Always `persist: false` — the mid-cost bucket. Both callers (the public "do we
 * deliver here?" check and checkout) use the coordinates to derive a distance and
 * then discard them, so nothing here is ever written to the database.
 */
export async function resolveAddress(input: { placeId?: string; address: string }): Promise<ResolvedAddress | null> {
  return resolvePlace(getAdvisoryProviders(), { ...input, persist: false });
}

/**
 * Cheapest bucket — typeahead, fires on every keystroke. First provider with a
 * non-empty result wins; Nominatim never has anything to offer here (it isn't
 * a typeahead service) so it's a harmless no-op at the end of the chain.
 */
export async function suggestAddresses(query: string): Promise<PlaceSuggestion[]> {
  warnIfNoSuggestProviderConfigured();
  for (const provider of getAdvisoryProviders()) {
    const hits = await provider.suggest(query, SUGGEST_OPTS);
    if (hits.length > 0) return hits;
  }
  return [];
}
