import { BOOKED, ONGOING, RUNNING, STARTING_SOON } from "./status";
import { inList, type Condition } from "@foundry/commons/model/condition";

// Single source of truth for the Status facet — also the pill/badge label map.
// "all" is a client-only pseudo-bucket, never a valid `orders.status` value, so
// it's excluded here and the server facet options map straight off this array.
//
// Deliberately NOT in orders-list.tsx: that module is "use client", so every one
// of its exports reaches the RSC graph as a client reference. The server page
// calling .map() on such a reference throws "…map is not a function" at render.

// Pseudo-buckets expand to real status sets. They exist because the `pills` facet
// kind parses to eq() — a comma list in the URL would match nothing.
const PSEUDO: Record<string, readonly string[]> = {
  ongoing: ONGOING,
  running: RUNNING,
  soon: STARTING_SOON,
  booked: BOOKED,
};

/**
 * Strips a pseudo-status out of the search params and hands back the real
 * condition to AND in. Keeping both halves here means they can't drift apart.
 */
export function orderStatusFilter(sp: Record<string, string | undefined>): {
  sp: Record<string, string | undefined>;
  extra: Condition | null;
} {
  const set = sp.status ? PSEUDO[sp.status] : undefined;
  if (!set) return { sp, extra: null };
  return { sp: { ...sp, status: undefined }, extra: inList("status", [...set]) };
}

export const ORDER_STATUS_PILLS = [
  { value: "ongoing", label: "Ongoing" },
  { value: "running", label: "Running" },
  { value: "booked", label: "Booked" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "paused", label: "Paused" },
  { value: "cancelled", label: "Cancelled" },
  { value: "completed", label: "Over" },
] as const;
