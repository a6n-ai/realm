import { createLogger } from "@realm/commons/logger";
import { geocodeAddress } from "./geocode";

const log = createLogger("delivery-resolve-address");

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places";
const DETAILS_FIELD_MASK = "location,formattedAddress";
const SEARCH_TEXT_FIELD_MASK = "places.location,places.formattedAddress";

export type ResolvedAddress = { lat: number; lng: number; formattedAddress: string };

type RawPlace = { location?: { latitude?: number; longitude?: number }; formattedAddress?: string };

function toResolved(raw: RawPlace | undefined): ResolvedAddress | null {
  const lat = raw?.location?.latitude;
  const lng = raw?.location?.longitude;
  const formattedAddress = raw?.formattedAddress;
  if (typeof lat !== "number" || typeof lng !== "number" || !formattedAddress) return null;
  return { lat, lng, formattedAddress };
}

// ponytail: this hits Places Details uncached on every call. place_id is the
// one field Google permits caching indefinitely — cache by place_id if request
// volume ever makes it worth it.
async function fetchPlaceDetails(placeId: string, apiKey: string): Promise<ResolvedAddress | null> {
  try {
    const res = await fetch(`${PLACES_ENDPOINT}/${encodeURIComponent(placeId)}`, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": DETAILS_FIELD_MASK },
    });
    if (!res.ok) return null;
    return toResolved((await res.json()) as RawPlace);
  } catch (e) {
    log.error({ err: e instanceof Error ? e.message : e }, "places details request failed");
    return null;
  }
}

async function fetchTextSearch(address: string, apiKey: string): Promise<ResolvedAddress | null> {
  try {
    const res = await fetch(`${PLACES_ENDPOINT}:searchText`, {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": SEARCH_TEXT_FIELD_MASK,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ textQuery: address }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { places?: RawPlace[] };
    return toResolved(body.places?.[0]);
  } catch (e) {
    log.error({ err: e instanceof Error ? e.message : e }, "places text search request failed");
    return null;
  }
}

async function fetchNominatim(address: string): Promise<ResolvedAddress | null> {
  const result = await geocodeAddress(address);
  if (!result) return null;
  return { lat: result.lat, lng: result.lng, formattedAddress: address };
}

/**
 * The only way coordinates enter the system. A client-supplied place_id/address
 * is resolved server-side so a client can never assert its own lat/lng — distance
 * from here decides a discount and a delivery fee.
 *
 * Order: place_id (Places Details) → text search → Nominatim → null. Never
 * throws — every failure path falls through, so a Google or Nominatim outage
 * degrades checkout rather than taking it down.
 */
export async function resolveAddress({
  placeId,
  address,
}: {
  placeId?: string;
  address: string;
}): Promise<ResolvedAddress | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (apiKey) {
    if (placeId) {
      const details = await fetchPlaceDetails(placeId, apiKey);
      if (details) return details;
    }
    const search = await fetchTextSearch(address, apiKey);
    if (search) return search;
  }

  return fetchNominatim(address);
}
