import { NotFoundError } from "@foundry/commons";
import { eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { orders } from "@/db/schema";

/** Every writer of an order's deliveries takes this first, before any row lock on the order or its customer. */
export async function lockOrder(tx: Tx, orderId: bigint): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${orderId})`);
}

/** One transaction that holds the order lock before `fn` reads anything; `order` is its id or public id. */
export async function withOrderLock<T>(order: bigint | string, fn: (tx: Tx, orderId: bigint) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    let orderId: bigint;
    if (typeof order === "string") {
      const [row] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.publicId, order)).limit(1);
      if (!row) throw new NotFoundError(`Order not found: ${order}`);
      orderId = row.id;
    } else orderId = order;
    await lockOrder(tx, orderId);
    return fn(tx, orderId);
  });
}
