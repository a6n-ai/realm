import { createLogger } from "@foundry/commons/logger";
import type { PlaceProvider } from "./types";

const log = createLogger("places-nominatim");

// OpenStreetMap Nominatim — keyless geocoder. Their usage policy requires a
// descriptive User-Agent identifying the app/contact, and caps this to light,
// human-triggered traffic (no bulk/automated geocoding).
const NOMINATIM_USER_AGENT = "Puchkaman/1.0 (+https://puchkaman.ca; puchkamancanada@gmail.com)";

/** ponytail: hardcoded to the puchkaman contact — parameterize per-app when a second app adopts this provider. */
export function nominatimProvider(): PlaceProvider {
  return {
    id: "nominatim",

    // Nominatim is not a typeahead provider, and its usage policy discourages
    // this kind of traffic — never wire it up for suggest.
    async suggest() {
      return [];
    },

    // `persist` is ignored: OSM data has no "Stored" bucket equivalent — Nominatim
    // is keyless and unlicensed either way, so there's nothing to gate on.
    async resolve({ address }) {
      if (!address.trim()) return null;

      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      url.searchParams.set("q", address);

      let res: Response;
      try {
        res = await fetch(url, { headers: { "User-Agent": NOMINATIM_USER_AGENT } });
      } catch (e) {
        log.error({ err: e instanceof Error ? e.message : e }, "geocode request failed");
        return null;
      }
      if (!res.ok) {
        log.error({ status: res.status }, "geocode request returned non-OK status");
        return null;
      }

      const results = (await res.json().catch(() => null)) as { lat?: string; lon?: string }[] | null;
      const first = results?.[0];
      if (!first?.lat || !first?.lon) return null;

      const lat = Number(first.lat);
      const lng = Number(first.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      return { lat, lng, formattedAddress: address };
    },
  };
}
