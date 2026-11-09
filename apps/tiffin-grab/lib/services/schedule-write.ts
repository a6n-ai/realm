import type { Tx } from "@/db/client";
import type { orders } from "@/db/schema";
import { materializeDeliveries } from "./deliveries.service";
import { applyHolidaysToOrder, type HolidayApplied } from "./holiday-apply";

/**
 * A schedule write under the order lock: lay the rows out (when `materialize`), then close any
 * declared holiday they land on. The caller holds the lock (withOrderLock / lockOrder).
 */
export async function scheduleWrite(
  tx: Tx,
  order: typeof orders.$inferSelect,
  actorId: bigint | null,
  opts: { materialize?: boolean } = {},
): Promise<HolidayApplied[]> {
  if (opts.materialize) await materializeDeliveries(tx, order);
  return applyHolidaysToOrder(tx, order, actorId);
}
