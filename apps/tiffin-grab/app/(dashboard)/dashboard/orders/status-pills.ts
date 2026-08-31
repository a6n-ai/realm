import { inList, type Condition } from "@foundry/commons/model/condition";

// Single source of truth for the Status facet — also the pill/badge label map.
// "all" is a client-only pseudo-bucket, never a valid `orders.status` value, so
// it's excluded here and the server facet options map straight off this array.
//
// Deliberately NOT in orders-list.tsx: that module is "use client", so every one
// of its exports reaches the RSC graph as a client reference. The server page
// calling .map() on such a reference throws "…map is not a function" at render.

// "ongoing" is the second pseudo-bucket: a saved view rather than an
// `orders.status` value, which the server expands to inList(status, …). It has to
// work this way because the `pills` facet kind parses to eq() — a comma-separated
// list in the URL would query status = "pending,active,paused" and match nothing.
export const ONGOING_STATUSES = ["pending", "active", "paused"] as const;

// Strips the pseudo-value out of the search params and hands back the real
// condition to AND in. Keeping both halves here means they can't drift apart.
export function ongoingFilter(sp: Record<string, string | undefined>): {
  sp: Record<string, string | undefined>;
  extra: Condition | null;
} {
  if (sp.status !== "ongoing") return { sp, extra: null };
  return { sp: { ...sp, status: undefined }, extra: inList("status", [...ONGOING_STATUSES]) };
}

export const ORDER_STATUS_PILLS = [
  { value: "ongoing", label: "Ongoing" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "paused", label: "Paused" },
  { value: "cancelled", label: "Cancelled" },
] as const;
