import { and, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import { db } from "@/db/client";
import { carts, notificationOutbox, orders, payments } from "@/db/schema";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { purgeStaleCarts } from "@/lib/services/carts.service";
import { ordersService } from "@/lib/services/orders.service";
import { SITE_URL } from "@/lib/seo";
import { resumeUrl } from "./token";

const log = createLogger("recovery-passes");

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
  // Upper bound: an order already inside the terminal window is about to be
  // (or just was) killed by terminalizeAbandonedOrders in this same run — a
  // "finish paying" link mailed to it would 404 the moment the customer clicks.
  const terminalCutoff = now - TERMINAL_AFTER_MS;

  const rows = await db
    .select({
      id: orders.id,
      publicId: orders.publicId,
      email: orders.customerEmail,
      name: orders.customerName,
      total: orders.total,
      userId: orders.userId,
      createdAt: orders.createdAt,
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
        gte(orders.createdAt, terminalCutoff),
        isNull(notificationOutbox.id),
      ),
    )
    .limit(BATCH);

  let reminded = 0;
  for (const row of rows) {
    try {
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
              // Pinned to this order's own creation, not "now" — the link and
              // the order die together, exactly TERMINAL_AFTER_MS after it
              // was created, whichever pass runs it.
              resumeUrl: resumeUrl(row.publicId, row.createdAt + TERMINAL_AFTER_MS),
            },
          },
          dedupeKey: `${row.publicId}:checkout_abandoned`,
        });
      });
      reminded += 1;
    } catch (err) {
      // A bad row (e.g. RECOVERY_LINK_SECRET unset) must not abort the rest
      // of the batch, or every later row in this run silently goes unreminded.
      log.error({ err, orderId: row.id }, "remindAbandonedOrders: skipping row after failure");
    }
  }

  return reminded;
}

/**
 * The abandoned-order sweep. When the coin-reservation slice lands this shrinks
 * rather than grows: releasing an expired reservation replaces reversing a
 * committed debit, and the mirroring ledger adjustment row goes with it.
 */
export async function terminalizeAbandonedOrders(now = Date.now()): Promise<number> {
  const cutoff = now - TERMINAL_AFTER_MS;

  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.status, "pending"), lt(orders.createdAt, cutoff)))
    .limit(BATCH);

  let changed = 0;
  for (const row of rows) {
    try {
      if (await ordersService.abandonPendingOrder(row.id)) changed += 1;
    } catch (err) {
      log.error({ err, orderId: row.id }, "terminalizeAbandonedOrders: skipping row after failure");
    }
  }
  return changed;
}

/**
 * Refreshes payment status from Clover for still-pending orders, one order at
 * a time via `ordersService.checkPaymentStatus` — the same row-level check the
 * admin "Check status" button runs, not a bulk call. This is the webhook
 * fallback: a customer who paid but whose webhook never landed (or landed
 * before the order existed) would otherwise sit `pending` until the 24h sweep
 * kills it — reversing coins and losing a sale that was actually paid.
 */
export async function syncPendingPaymentStatuses(now = Date.now()): Promise<number> {
  const cutoff = now - TERMINAL_AFTER_MS;

  const rows = await db
    .select({ id: orders.id, publicId: orders.publicId })
    .from(orders)
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .where(
      and(
        eq(orders.status, "pending"),
        eq(payments.status, "awaiting_payment"),
        gte(orders.createdAt, cutoff),
      ),
    )
    .limit(BATCH);

  let checked = 0;
  for (const row of rows) {
    try {
      await ordersService.checkPaymentStatus(row.publicId);
      checked += 1;
    } catch (err) {
      log.error({ err, orderId: row.id }, "syncPendingPaymentStatuses: skipping row after failure");
    }
  }
  return checked;
}

export async function purgeCarts(now = Date.now()): Promise<number> {
  return purgeStaleCarts(now - PURGE_AFTER_MS);
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

  let reminded = 0;
  for (const row of rows) {
    // The client only mirrors non-empty carts (cart-provider.tsx skips the
    // POST on empty), so the last-written snapshot for an emptied cart is
    // stale and non-empty here — checking length is what actually catches
    // "the customer deliberately emptied it."
    if (row.items.length === 0) continue;
    try {
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
      reminded += 1;
    } catch (err) {
      log.error({ err, cartId: row.id }, "remindAbandonedCarts: skipping row after failure");
    }
  }

  return reminded;
}
