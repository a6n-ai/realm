// External storefront + location links used across the marketing site.
// Uber Eats store URL matches the sync source (lib/sync/snapshots/uber-eats.json).
export const UBER_EATS_URL =
  "https://www.ubereats.com/ca/store/street-food-cafe-%E2%80%93-puchkaman/uA_yNuarQgGGD61dDChmOQ";

// Stated storefront address (also shown in the header ribbon, footer, contact).
export const ADDRESS = "3315 Danforth Ave, Scarborough, ON";

// Keyless Google Maps embed + directions (no API key required).
export const MAP_EMBED_URL = `https://maps.google.com/maps?q=${encodeURIComponent(ADDRESS)}&z=15&output=embed`;
export const MAP_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ADDRESS)}`;
