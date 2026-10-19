import { and, eq, isNotNull } from "drizzle-orm";
import type { db } from "@/db/client";
import { orderActivities, orders } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** An ended order (completed or cancelled) has nothing left to watch, so it leaves the Look out for tab. */
export async function clearLookOutOnEnd(tx: Tx, orderId: bigint, why: string): Promise<void> {
  const [row] = await tx.update(orders)
    .set({ lookOutAt: null, lookOutBy: null, lookOutNote: null })
    .where(and(eq(orders.id, orderId), isNotNull(orders.lookOutAt)))
    .returning({ organizationId: orders.organizationId });
  if (row) await tx.insert(orderActivities).values({ orderId, type: "note", note: `Look out for cleared: ${why}`, organizationId: row.organizationId });
}
