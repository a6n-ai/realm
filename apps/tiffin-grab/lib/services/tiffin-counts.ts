// Pure tiffin math shared by customer deliveries UI. No DB access — callers pass rows in.
//
// A delivery row is worth its own `tiffinUnits` — normally == order.persons, except a Friday
// row that absorbed a weekend add-on (see deliveries.service.ts materializeDeliveries), which
// carries more. A row counts as delivered once it is still `scheduled` AND EITHER its cutoff
// has passed (the pre-existing "too late to change it now, so it must be going out" proxy) OR
// OptimoRoute has confirmed the courier actually completed it (lib/services/optimoroute/
// completions.ts's pullCompletions, which can land before cutoff on an early route run). A
// "failed" OptimoRoute completion never reaches this function as `scheduled` in the first
// place — pullCompletions already flips those rows to `skipped` and pools the tiffin for a
// make-up, so no separate handling is needed here for the negative case. Paused, skipped, and
// cancelled rows never count as delivered — their entitlement lives in the remain pool
// (post-cutoff misses) or is void (cancelled).

export type DeliveryForCounts = {
  status: "scheduled" | "paused" | "skipped" | "cancelled";
  cutoffAt: number;
  makeupForDeliveryId: bigint | null;
  pooledAt: number | null;
  tiffinUnits: number;
  optimoCompletionStatus?: string | null;
};

export function deliveredTiffinCount(rows: DeliveryForCounts[], nowMs: number): number {
  let units = 0;
  for (const r of rows) {
    if (r.status !== "scheduled") continue;
    if (r.cutoffAt > nowMs && r.optimoCompletionStatus !== "success") continue;
    units += r.tiffinUnits;
  }
  return units;
}

export function remainingTiffinCount(tiffinCount: number, rows: DeliveryForCounts[], nowMs: number): number {
  return tiffinCount - deliveredTiffinCount(rows, nowMs);
}
