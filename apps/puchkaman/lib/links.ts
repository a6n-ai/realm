// External storefront + location links used across the marketing site.
// Uber Eats store URL matches the sync source (lib/sync/snapshots/uber-eats.json).
export const UBER_EATS_URL =
  "https://www.ubereats.com/ca/store/street-food-cafe-%E2%80%93-puchkaman/uA_yNuarQgGGD61dDChmOQ";
export const DOORDASH_URL =
  "https://www.doordash.com/store/puchkaman-canada-street-food-cafe-scarborough-38408175/";

// Storefront address + phone (verified via the Google business listing).
// This is the Scarborough location — delivery zones, checkout's origin pin,
// and the contact page's ordering CTAs all key off it. Keep it as the lone
// exported ADDRESS/PHONE for that reason: Delta is a published storefront
// with its own phone/hours (see LOCATIONS) but has no delivery/ordering
// setup of its own yet, so anything order-shaped still resolves to here.
export const ADDRESS = "3315 Danforth Ave, Scarborough, ON";
export const PHONE_DISPLAY = "(416) 738-3833";
export const PHONE_TEL = "+14167383833";

export const MAP_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ADDRESS)}`;

// Every storefront under the Street Food Café – Puchkaman banner, for
// homepage display (see components/brutal/locations-section.tsx). Coordinates
// geocoded from each full address; Scarborough's mirrors the values already
// baked into lib/delivery/distance.ts's DEFAULT_STORE_LAT/LNG.
export type OpeningHours = {
  /** schema.org day names, so this feeds JSON-LD without a second mapping. */
  days: string[];
  /** Human label for the same span, e.g. "Sun – Thu". */
  label: string;
  /** 24h "HH:MM"; `closes` may be past midnight (e.g. "04:00" = 4am next day). */
  opens: string;
  closes: string;
};

export type StoreLocation = {
  /**
   * The organization row's clientCode — the stable key for matching a
   * franchise to its storefront data. `city` is a display label that differs
   * between the two ("Toronto" on the org row vs "Scarborough" here), so
   * matching on it silently misses and falls back to the first entry.
   */
  clientCode: string;
  city: string;
  province: string;
  /** Wider region a visitor is more likely to search for, if the city alone is obscure. */
  region?: string;
  addressLines: [street: string, cityLine: string];
  fullAddress: string;
  lat: number;
  lng: number;
  directionsUrl: string;
  phoneDisplay: string;
  phoneTel: string;
  hours: OpeningHours[];
  /** Each storefront runs its own account; there is no single brand handle. */
  instagramUrl: string;
  instagramHandle: string;
};

const DELTA_ADDRESS = "9253 120 St, Delta, BC V4C 6R8";

/**
 * Still frame from the hero clip (public/hero/loaded-puchka.mp4), used as the
 * last-resort art for the "what is a fusion puchka" blocks on / and /fusion.
 * A real catalog photo still wins wherever one exists — this only replaces the
 * striped Ph placeholder that showed when no fusion product had an image.
 */
export const FUSION_FALLBACK_IMAGE = "/fusion/fusion-puchka.jpg";

/**
 * Catering service areas — one per storefront that runs catering.
 *
 * The public catering form requires one of these. Both regions currently
 * notify the same inbox and the same WhatsApp number, so the region is what
 * makes an enquiry triageable: without it a Vancouver job and a Toronto job
 * arrive indistinguishable. `city` ties the region back to the LOCATIONS
 * entry that serves it.
 */
export type CateringRegion = {
  /** Stored on the inquiry row and shown in admin — human-readable on purpose,
   *  matching the other free-text columns on catering_inquiries. */
  label: string;
  city: string;
  /** Short form for the notification subject line, e.g. "[Toronto]". */
  tag: string;
};

export const CATERING_REGIONS: CateringRegion[] = [
  { label: "Toronto & the GTA", city: "Scarborough", tag: "Toronto" },
  { label: "Metro Vancouver & the Lower Mainland", city: "Delta", tag: "Vancouver" },
];

/**
 * The storefront serving a franchise. Keyed on clientCode first because the
 * org row's `city` is a display label that need not equal ours ("Toronto" vs
 * "Scarborough"); the city match is a secondary path for callers that only
 * have a label, and the first entry is the last resort.
 */
export function storeForFranchise(
  location: { clientCode?: string | null; city?: string | null } | null,
): StoreLocation {
  return (
    LOCATIONS.find((l) => !!location?.clientCode && l.clientCode === location.clientCode) ??
    LOCATIONS.find((l) => !!location?.city && l.city === location.city) ??
    LOCATIONS[0]
  );
}

export const CATERING_REGION_LABELS = CATERING_REGIONS.map((r) => r.label);

export function cateringRegionTag(label: string): string {
  return CATERING_REGIONS.find((r) => r.label === label)?.tag ?? "Unspecified";
}

/** "15:00" -> "3pm", "12:00" -> "12pm", "02:30" -> "2:30am". Minutes are
 *  dropped when :00 so the common case reads as street signage, not a table. */
function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 || h === 24 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${suffix}` : `${hour12}:${String(m).padStart(2, "0")}${suffix}`;
}

/** Display form of one opening span, e.g. "3pm – 2am". */
export function formatHours(h: OpeningHours): string {
  return `${formatTime(h.opens)} – ${formatTime(h.closes)}`;
}

export const LOCATIONS: StoreLocation[] = [
  {
    clientCode: "PK-TOR",
    city: "Scarborough",
    province: "ON",
    addressLines: ["3315 Danforth Ave", "Scarborough, ON"],
    fullAddress: ADDRESS,
    lat: 43.69234,
    lng: -79.28251,
    directionsUrl: MAP_DIRECTIONS_URL,
    phoneDisplay: PHONE_DISPLAY,
    phoneTel: PHONE_TEL,
    hours: [
      { days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"], label: "Sun – Thu", opens: "15:00", closes: "02:00" },
      { days: ["Friday", "Saturday"], label: "Fri – Sat", opens: "15:00", closes: "03:00" },
    ],
    instagramUrl: "https://www.instagram.com/puchkamancanada",
    instagramHandle: "@puchkamancanada",
  },
  {
    clientCode: "PK-VAN",
    city: "Delta",
    province: "BC",
    // The storefront sits on 120 St / Scott Road, right on the Delta-Surrey
    // line — which is why its own Instagram handle reads "surrey".
    region: "Metro Vancouver",
    addressLines: ["9253 120 St", "Delta, BC V4C 6R8"],
    fullAddress: DELTA_ADDRESS,
    // From the store's own Google Maps place pin (the !3d/!4d pair in its
    // maps URL). The previous values were ~1.9km south of the real shop.
    lat: 49.171388,
    lng: -122.8907962,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(DELTA_ADDRESS)}`,
    phoneDisplay: "(778) 794-0222",
    phoneTel: "+17787940222",
    // Opens earlier and runs later than Scarborough — this location trades on
    // late-night, so the two stores genuinely do not share a schedule.
    hours: [
      { days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"], label: "Sun – Thu", opens: "12:00", closes: "02:00" },
      { days: ["Friday", "Saturday"], label: "Fri – Sat", opens: "12:00", closes: "04:00" },
    ],
    instagramUrl: "https://www.instagram.com/surreypuchkaman/",
    instagramHandle: "@surreypuchkaman",
  },
];
