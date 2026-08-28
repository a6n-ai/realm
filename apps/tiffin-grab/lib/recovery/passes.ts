import { and, inArray, lt } from "drizzle-orm";
import { createLogger } from "@realm/commons/logger";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { abandonPendingOrder } from "@/lib/services/orders.service";

const log = createLogger("recovery-passes");

/** Well outside any customer's checkout hesitation window. */
export const TERMINAL_AFTER_MS = 24 * 60 * 60 * 1000;

// ponytail: capped batch per run, add a cursor if the backlog ever exceeds it.
const BATCH = 200;

/**
 * The abandoned-order sweep: cancels an order whose payment was never
 * claimed, well past any reasonable checkout window. Ported from puchkaman's
 * terminalizeAbandonedOrders, but tiffin-grab has no wallet reversal to run
 * here — see abandonPendingOrder's comment for why.
 */
export async function terminalizeAbandonedOrders(now = Date.now()): Promise<number> {
  const cutoff = now - TERMINAL_AFTER_MS;

  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(inArray(orders.status, ["active", "waitlisted"]), lt(orders.createdAt, cutoff)))
    .limit(BATCH);

  let changed = 0;
  for (const row of rows) {
    try {
      if (await abandonPendingOrder(row.id)) changed += 1;
    } catch (err) {
      log.error({ err, orderId: row.id }, "terminalizeAbandonedOrders: skipping row after failure");
    }
  }
  return changed;
}
