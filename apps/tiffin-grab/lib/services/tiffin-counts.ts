// Pure tiffin math shared by customer deliveries UI. No DB access — callers pass rows in.
//
// A delivery row is worth its own `tiffinUnits` — normally == order.persons, except a Friday
// row that absorbed a weekend add-on (see deliveries.service.ts materializeDeliveries), which
// carries more. A row counts as delivered only when it is still `scheduled` AND its delivery is
// confirmed: an OptimoRoute success from pullCompletions, or an admin marking it Delivered (which
// records the same success). The cutoff is not proof: it locks customer changes, and an
// unconfirmed day stays "awaiting confirmation" until the pull or an admin settles it. A
// "failed" completion flips the row to `skipped`. Paused, skipped, and cancelled rows never count
// as delivered: a failed drop's tiffin is moved to another day, a cancelled one is void.

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
    if (r.optimoCompletionStatus !== "success") continue;
    units += r.tiffinUnits;
  }
  return units;
}

export function remainingTiffinCount(tiffinCount: number, rows: DeliveryForCounts[], nowMs: number): number {
  return tiffinCount - deliveredTiffinCount(rows, nowMs);
}
