export function describeActivity(a: { type: string; note: string | null; fromStatus: string | null; toStatus: string | null }) {
  switch (a.type) {
    case "created": return "Order created";
    case "activated": return "Activated";
    case "paused": return "Paused";
    case "resumed": return "Resumed";
    case "cancelled": return "Cancelled";
    case "status_change": return `Status: ${a.fromStatus} → ${a.toStatus}`;
    default: return a.note ?? a.type;
  }
}
