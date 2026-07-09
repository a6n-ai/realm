// Single source of truth for the Status facet — also the pill/badge label map.
// "all" is a client-only pseudo-bucket, never a valid `orders.status` value, so
// it's excluded here and the server facet options map straight off this array.
//
// Deliberately NOT in orders-list.tsx: that module is "use client", so every one
// of its exports reaches the RSC graph as a client reference. The server page
// calling .map() on such a reference throws "…map is not a function" at render.
export const ORDER_STATUS_PILLS = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "paused", label: "Paused" },
  { value: "cancelled", label: "Cancelled" },
] as const;
