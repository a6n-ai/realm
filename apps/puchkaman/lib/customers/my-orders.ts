import { and, count, eq, inArray, not, sql } from "drizzle-orm";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { pageOrder } from "@foundry/database";
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

/**
 * One customer's orders, newest first, split by ongoing vs done and paged in SQL
 * so a long history never loads whole. Scoped by the caller's own publicId,
 * resolved to the bigint id here rather than taken from the caller — the session
 * exposes publicId only, and joining on it is what keeps one customer's history
 * from being addressable by another.
 */
export async function myOrdersPage(
  userPublicId: string,
  opts: { ongoing: boolean; page: PageRequest },
): Promise<Page<MyOrderSummary>> {
  const terminal = inArray(orders.status, [...TERMINAL] as never);
  const where = and(eq(users.publicId, userPublicId), opts.ongoing ? not(terminal) : terminal);

  const [rows, [{ total }]] = await Promise.all([
    db
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
      .where(where)
      .groupBy(orders.id, orders.publicId, orders.createdAt, orders.status, orders.total)
      .orderBy(...pageOrder("desc", orders.createdAt, orders.id))
      .limit(opts.page.size)
      .offset(opts.page.page * opts.page.size),
    db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(where),
  ]);

  return {
    items: rows.map((r) => ({
      publicId: r.publicId,
      reference: r.publicId,
      // createdAt is stored as epoch millis (bigint mode: "number"), not a Date.
      placedAt: new Date(r.placedAt),
      status: r.status,
      total: r.total ? Number(r.total) : 0,
      itemCount: Number(r.itemCount),
      ongoing: !TERMINAL.has(r.status),
    })),
    page: opts.page.page,
    size: opts.page.size,
    total,
  };
}
