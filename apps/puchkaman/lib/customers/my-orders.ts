import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orderItems, orders, users } from "@/db/schema";

export type MyOrderSummary = {
  publicId: string;
  reference: string;
  placedAt: Date;
  status: string;
  total: number;
  itemCount: number;
  ongoing: boolean;
};

/** Mirrors isTerminal() in lib/order-tracking/load.ts — one definition of "done". */
const TERMINAL = new Set(["fulfilled", "cancelled", "failed"]);

export function splitOrders(rows: MyOrderSummary[]): {
  ongoing: MyOrderSummary[];
  past: MyOrderSummary[];
} {
  const byNewest = [...rows].sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());
  return {
    ongoing: byNewest.filter((o) => o.ongoing),
    past: byNewest.filter((o) => !o.ongoing),
  };
}

/**
 * Scoped by the caller's own publicId, resolved to the bigint id here rather
 * than taken from the caller — the session exposes publicId only, and joining
 * on it is what keeps one customer's history from being addressable by another.
 */
export async function myOrders(userPublicId: string): Promise<MyOrderSummary[]> {
  const rows = await db
    .select({
      publicId: orders.publicId,
      placedAt: orders.createdAt,
      status: orders.status,
      total: orders.total,
      itemCount: count(orderItems.id),
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(eq(users.publicId, userPublicId))
    .groupBy(orders.publicId, orders.createdAt, orders.status, orders.total)
    .orderBy(desc(orders.createdAt));

  return rows.map((r) => ({
    publicId: r.publicId,
    reference: r.publicId,
    // createdAt is stored as epoch millis (bigint mode: "number"), not a Date.
    placedAt: new Date(r.placedAt),
    status: r.status,
    total: r.total ? Number(r.total) : 0,
    itemCount: Number(r.itemCount),
    ongoing: !TERMINAL.has(r.status),
  }));
}
