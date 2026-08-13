// External storefront + location links used across the marketing site.
// Uber Eats store URL matches the sync source (lib/sync/snapshots/uber-eats.json).
export const UBER_EATS_URL =
  "https://www.ubereats.com/ca/store/street-food-cafe-%E2%80%93-puchkaman/uA_yNuarQgGGD61dDChmOQ";
export const DOORDASH_URL =
  "https://www.doordash.com/store/puchkaman-canada-street-food-cafe-scarborough-38408175/";

// Storefront address + phone (verified via the Google business listing).
// This is the operating Scarborough location — delivery zones, checkout's
// origin pin, and the contact page all key off it. Keep it as the lone
// exported ADDRESS/PHONE for that reason; the Delta location below is
// display-only (LOCATIONS) until it has its own delivery/ordering setup.
export const ADDRESS = "3315 Danforth Ave, Scarborough, ON";
export const PHONE_DISPLAY = "(416) 738-3833";
export const PHONE_TEL = "+14167383833";

export const MAP_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ADDRESS)}`;

// Every storefront under the Street Food Café – Puchkaman banner, for
// homepage display (see components/brutal/locations-section.tsx). Coordinates
// geocoded from each full address; Scarborough's mirrors the values already
// baked into lib/delivery/distance.ts's DEFAULT_STORE_LAT/LNG.
export type StoreLocation = {
  city: string;
  province: string;
  addressLines: [street: string, cityLine: string];
  fullAddress: string;
  lat: number;
  lng: number;
  directionsUrl: string;
};

export const LOCATIONS: StoreLocation[] = [
  {
    city: "Scarborough",
    province: "ON",
    addressLines: ["3315 Danforth Ave", "Scarborough, ON"],
    fullAddress: ADDRESS,
    lat: 43.69234,
    lng: -79.28251,
    directionsUrl: MAP_DIRECTIONS_URL,
  },
  {
    city: "Delta",
    province: "BC",
    addressLines: ["9253 120 St", "Delta, BC V4C 6R8"],
    fullAddress: "9253 120 St, Delta, BC V4C 6R8",
    lat: 49.1545,
    lng: -122.8904,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent("9253 120 St, Delta, BC V4C 6R8")}`,
  },
];
