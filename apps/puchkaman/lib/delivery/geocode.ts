import { createLogger } from "@realm/commons/logger";

const log = createLogger("delivery-geocode");

// OpenStreetMap Nominatim — keyless geocoder, same service already used for the
// /contact map embed (lib/links.ts). Their usage policy requires a descriptive
// User-Agent identifying the app/contact, and caps this to light, human-triggered
// traffic (no bulk/automated geocoding) — both hold here: this is only ever called
// once per real checkout attempt, never in a loop or on a timer.
const NOMINATIM_USER_AGENT = "Puchkaman/1.0 (+https://puchkaman.ca; puchkamancanada@gmail.com)";

export type GeocodeResult = { lat: number; lng: number };

/** Server-side only — never call from the browser (keeps Nominatim traffic attributable to us, not the customer's IP/UA). */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
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

  return { lat, lng };
}
