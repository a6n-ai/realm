import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { carts, notificationOutbox, orders, payments } from "@/db/schema";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { SITE_URL } from "@/lib/seo";
import { resumeUrl } from "./token";

/** Long enough that a customer fetching their card has not "abandoned" anything. */
export const REMIND_AFTER_MS = 60 * 60 * 1000;
/** Well outside the reminder window: Clover has no void, so a terminalized order stays payable. */
export const TERMINAL_AFTER_MS = 24 * 60 * 60 * 1000;
export const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

// ponytail: capped batch per run, add a cursor if the backlog ever exceeds it.
const BATCH = 200;

/**
 * No reminder column on `orders`: notification_outbox has a unique index on
 * dedupe_key, enqueue inserts with onConflictDoNothing, and drained rows change
 * status rather than being deleted — so the dedupe key is itself a durable
 * once-only guarantee, and the anti-join below is what keeps this pass from
 * re-reading orders it has already handled.
 */
export async function remindAbandonedOrders(now = Date.now()): Promise<number> {
  const cutoff = now - REMIND_AFTER_MS;
  const expiresAt = now + TERMINAL_AFTER_MS;

  const rows = await db
    .select({
      id: orders.id,
      publicId: orders.publicId,
      email: orders.customerEmail,
      name: orders.customerName,
      total: orders.total,
      userId: orders.userId,
    })
    .from(orders)
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .leftJoin(
      notificationOutbox,
      eq(notificationOutbox.dedupeKey, sql`${orders.publicId} || ':checkout_abandoned:email'`),
    )
    .where(
      and(
        eq(orders.status, "pending"),
        eq(payments.status, "awaiting_payment"),
        lt(orders.createdAt, cutoff),
        isNull(notificationOutbox.id),
      ),
    )
    .limit(BATCH);

  for (const row of rows) {
    await db.transaction(async (tx) => {
      await enqueueNotification(tx, {
        event: "checkout_abandoned",
        kind: "marketing",
        ...(row.userId ? { recipientId: row.userId } : { recipientEmail: row.email }),
        title: "Your order is waiting",
        body: `Order ${row.publicId}`,
        href: `/track/${row.publicId}`,
        data: {
          order: {
            publicId: row.publicId,
            total: String(row.total),
            resumeUrl: resumeUrl(row.publicId, expiresAt),
          },
        },
        dedupeKey: `${row.publicId}:checkout_abandoned`,
      });
    });
  }

  return rows.length;
}

export async function remindAbandonedCarts(now = Date.now()): Promise<number> {
  const cutoff = now - REMIND_AFTER_MS;

  const rows = await db
    .select({ id: carts.id, publicId: carts.publicId, email: carts.email, items: carts.items, userId: carts.userId })
    .from(carts)
    .where(
      and(
        isNotNull(carts.email),
        isNull(carts.convertedOrderId),
        isNull(carts.remindedAt),
        lt(carts.lastActivityAt, cutoff),
      ),
    )
    .limit(BATCH);

  for (const row of rows) {
    await db.transaction(async (tx) => {
      await enqueueNotification(tx, {
        event: "cart_abandoned",
        kind: "marketing",
        ...(row.userId ? { recipientId: row.userId } : { recipientEmail: row.email! }),
        title: "You left something behind",
        body: `${row.items.length} item${row.items.length === 1 ? "" : "s"} in your cart`,
        href: "/cart",
        data: {
          cart: {
            itemCount: String(row.items.reduce((n, i) => n + i.quantity, 0)),
            firstItem: row.items[0]?.name ?? "",
            cartUrl: `${SITE_URL}/cart`,
          },
        },
        dedupeKey: `${row.publicId}:cart_abandoned`,
      });
      // Stamped in the same transaction as the enqueue: a reminder that rolled
      // back must not look sent.
      await tx.update(carts).set({ remindedAt: now }).where(eq(carts.id, row.id));
    });
  }

  return rows.length;
}
