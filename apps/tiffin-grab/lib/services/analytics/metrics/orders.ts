// Server-safe plain TS: no "use client", no db import. Shared by the Orders page and analytics drill links.
export const ORDER_FACET_FIELDS = ["status", "plan", "tier", "mealSize", "zone", "org", "createdAt"] as const;
export type OrderFacetField = (typeof ORDER_FACET_FIELDS)[number];
