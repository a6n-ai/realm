// Pure tiffin math shared by customer deliveries UI. No DB access — callers pass rows in.
//
// A delivery *day* is worth `persons` tiffins. A day is treated as delivered once its cutoff has
// passed AND it is still `scheduled` (this includes make-up rows, which stay `scheduled`). Paused,
// skipped, and cancelled rows never count as delivered — their entitlement lives in the remain
// pool (post-cutoff misses) or is void (cancelled).

export type DeliveryForCounts = {
  status: "scheduled" | "paused" | "skipped" | "cancelled";
  cutoffAt: number;
  makeupForDeliveryId: bigint | null;
  pooledAt: number | null;
};

export function deliveredTiffinCount(
  persons: number,
  rows: DeliveryForCounts[],
  nowMs: number,
): number {
  let days = 0;
  for (const r of rows) {
    if (r.status !== "scheduled") continue;
    if (r.cutoffAt > nowMs) continue;
    days += 1;
  }
  return days * persons;
}

export function remainingTiffinCount(
  tiffinCount: number,
  persons: number,
  rows: DeliveryForCounts[],
  nowMs: number,
): number {
  return tiffinCount - deliveredTiffinCount(persons, rows, nowMs);
}
