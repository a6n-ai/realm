// Derived label for the customer view. There is no `delivered` status and no
// confirmation actor — a past, still-"scheduled", non-skipped delivery is
// ASSUMED delivered. Isolated here so a real status can replace the derivation
// later without touching call sites.
export function deliveryDisplayStatus(
  status: string, deliveryDate: string, today: string,
): "Scheduled" | "Delivered" | "Skipped" | "Paused" | "Cancelled" {
  if (status === "skipped") return "Skipped";
  if (status === "paused") return "Paused";
  if (status === "cancelled") return "Cancelled";
  // status === "scheduled"
  return deliveryDate < today ? "Delivered" : "Scheduled";
}
