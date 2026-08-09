// External storefront + location links used across the marketing site.
// Uber Eats store URL matches the sync source (lib/sync/snapshots/uber-eats.json).
export const UBER_EATS_URL =
  "https://www.ubereats.com/ca/store/street-food-cafe-%E2%80%93-puchkaman/uA_yNuarQgGGD61dDChmOQ";
export const DOORDASH_URL =
  "https://www.doordash.com/store/puchkaman-canada-street-food-cafe-scarborough-38408175/";

// Storefront address + phone (verified via the Google business listing).
export const ADDRESS = "3315 Danforth Ave, Scarborough, ON";
export const PHONE_DISPLAY = "(416) 738-3833";
export const PHONE_TEL = "+14167383833";

export const MAP_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ADDRESS)}`;
