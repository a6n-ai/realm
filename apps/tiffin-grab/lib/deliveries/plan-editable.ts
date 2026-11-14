import { ValidationError } from "@foundry/commons";
import { eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { orders } from "@/db/schema";
import { ENDED, inOrderStatuses } from "@/lib/orders/status";

export const isPlanClosed = (order: { status: string } | undefined) => !order || inOrderStatuses(ENDED, order.status);

/** Loads the order and refuses when it is missing, cancelled or completed; each caller passes its own message. */
export async function assertPlanEditable(tx: Tx, orderId: bigint, message: string) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || isPlanClosed(order)) throw new ValidationError(message);
  return order;
}
