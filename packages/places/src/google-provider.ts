import { createLogger } from "@realm/commons/logger";
import type { PlaceProvider, PlaceSuggestion, ResolvedPlace } from "./types";

const log = createLogger("places-google");

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places";
const DETAILS_FIELD_MASK = "location,formattedAddress";
const SEARCH_TEXT_FIELD_MASK = "places.location,places.formattedAddress";

type RawPlace = { location?: { latitude?: number; longitude?: number }; formattedAddress?: string };

function toResolved(raw: RawPlace | undefined): ResolvedPlace | null {
  const lat = raw?.location?.latitude;
  const lng = raw?.location?.longitude;
  const formattedAddress = raw?.formattedAddress;
  if (typeof lat !== "number" || typeof lng !== "number" || !formattedAddress) return null;
  return { lat, lng, formattedAddress };
}

// ponytail: this hits Places Details uncached on every call. place_id is the
// one field Google permits caching indefinitely — cache by place_id if request
// volume ever makes it worth it.
async function fetchPlaceDetails(placeId: string, apiKey: string): Promise<ResolvedPlace | null> {
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

async function fetchTextSearch(address: string, apiKey: string): Promise<ResolvedPlace | null> {
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

async function fetchAutocomplete(query: string, apiKey: string): Promise<PlaceSuggestion[]> {
  try {
    const res = await fetch(`${PLACES_ENDPOINT}:autocomplete`, {
      method: "POST",
      headers: { "X-Goog-Api-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ input: query }),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[];
    };
    const suggestions: PlaceSuggestion[] = [];
    for (const s of body.suggestions ?? []) {
      const placeId = s.placePrediction?.placeId;
      const label = s.placePrediction?.text?.text;
      if (placeId && label) suggestions.push({ placeId, label });
    }
    return suggestions;
  } catch (e) {
    log.error({ err: e instanceof Error ? e.message : e }, "places autocomplete request failed");
    return [];
  }
}

/**
 * Places Details by placeId, then text search — same resolution order as the
 * resolveAddress() this was ported from. `persist` is unused: Google's Places
 * API (New) has no storage-licensed bucket distinct from Core the way AWS does.
 */
export function googlePlaceProvider(): PlaceProvider {
  return {
    id: "google",

    async suggest(query) {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      // A debounced typeahead fires on every keystroke, including backspace-to-empty
      // — an empty/whitespace query must never become a billable Autocomplete call.
      if (!apiKey || !query.trim()) return [];
      return fetchAutocomplete(query, apiKey);
    },

    async resolve({ placeId, address }) {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return null;

      if (placeId) {
        const details = await fetchPlaceDetails(placeId, apiKey);
        if (details) return details;
      }
      if (!address.trim()) return null;
      return fetchTextSearch(address, apiKey);
    },
  };
}
