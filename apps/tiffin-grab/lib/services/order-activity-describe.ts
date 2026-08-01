export type OrderActivityLike = {
  type: string;
  note: string | null;
  fromStatus: string | null;
  toStatus: string | null;
};

export function describeActivity(a: OrderActivityLike): string {
  switch (a.type) {
    case "created":
      return "Order created";
    case "activated":
      return "Activated";
    case "paused":
      return "Paused";
    case "resumed":
      return "Resumed";
    case "cancelled":
      return "Cancelled";
    case "status_change":
      return `Status: ${a.fromStatus ?? "?"} → ${a.toStatus ?? "?"}`;
    case "skipped":
      return "Delivery skipped";
    case "unskipped":
      return "Delivery un-skipped";
    case "delivery_address_changed":
      return "Delivery address changed";
    case "pool_scheduled":
      return "Pooled tiffin scheduled";
    case "meal_pick":
      return a.note ? `Meal pick — ${a.note}` : "Meal pick updated";
    case "note":
      return a.note ? `Note — ${a.note}` : "Note added";
    case "payment_claimed":
      return a.note ? `Payment submitted — ${a.note}` : "Payment submitted";
    case "payment_verified":
      return a.note ? `Payment verified — ${a.note}` : "Payment verified";
    case "payment_rejected":
      return a.note ? `Payment rejected — ${a.note}` : "Payment rejected";
    default:
      return a.note ?? a.type.replaceAll("_", " ");
  }
}

export function describeActivityActor(a: {
  createdBy: bigint | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
}): { label: string; kind: "system" | "staff" | "customer" } {
  if (a.createdBy == null) return { label: "System", kind: "system" };
  const label = a.actorName?.trim() || a.actorEmail || "Unknown user";
  if (a.actorRole === "admin" || a.actorRole === "member") {
    return { label, kind: "staff" };
  }
  return { label, kind: "customer" };
}
