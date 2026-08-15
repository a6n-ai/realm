// Pure tiffin math shared by customer deliveries UI. No DB access — callers pass rows in.
//
// A delivery row is worth its own `tiffinUnits` — normally == order.persons, except a Friday
// row that absorbed a weekend add-on (see deliveries.service.ts materializeDeliveries), which
// carries more. A row counts as delivered once its cutoff has passed AND it is still
// `scheduled` (this includes make-up rows, which stay `scheduled`). Paused, skipped, and
// cancelled rows never count as delivered — their entitlement lives in the remain pool
// (post-cutoff misses) or is void (cancelled).

export type DeliveryForCounts = {
  status: "scheduled" | "paused" | "skipped" | "cancelled";
  cutoffAt: number;
  makeupForDeliveryId: bigint | null;
  pooledAt: number | null;
  tiffinUnits: number;
};

export function deliveredTiffinCount(rows: DeliveryForCounts[], nowMs: number): number {
  let units = 0;
  for (const r of rows) {
    if (r.status !== "scheduled") continue;
    if (r.cutoffAt > nowMs) continue;
    units += r.tiffinUnits;
  }
  return units;
}

export function remainingTiffinCount(tiffinCount: number, rows: DeliveryForCounts[], nowMs: number): number {
  return tiffinCount - deliveredTiffinCount(rows, nowMs);
}
