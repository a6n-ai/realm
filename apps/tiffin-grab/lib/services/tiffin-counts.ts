// Pure tiffin math shared by customer deliveries UI. No DB access — callers pass rows in.
//
// A delivery row is worth its own `tiffinUnits` — normally == order.persons, except a Friday
// row that absorbed a weekend add-on (see deliveries.service.ts materializeDeliveries), which
// carries more. A row counts as delivered once it is still `scheduled` AND EITHER its cutoff
// has passed (the pre-existing "too late to change it now, so it must be going out" proxy) OR
// OptimoRoute has confirmed the courier actually completed it (lib/services/optimoroute/
// completions.ts's pullCompletions, which can land before cutoff on an early route run). A
// "failed" OptimoRoute completion never reaches this function as `scheduled` — pullCompletions
// flips those rows to `skipped`. An open stop stays scheduled, so it still counts once its
// cutoff has passed. Paused, skipped, and cancelled rows never count as
// delivered: a failed drop's tiffin is moved to another day, a cancelled one is void.

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
