import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";

const enqueued = vi.hoisted(() => [] as { event: string; recipientEmail?: string; dedupeKey?: string; data?: unknown }[]);
const outboxIds = vi.hoisted(() => [] as bigint[]);

/**
 * The real `enqueueNotification` is what stamps notification_outbox with the
 * channel-suffixed dedupe key the anti-join in remindAbandonedOrders reads —
 * a mock that only records call args (and never touches the DB) can never
 * make that guard's "second run finds nothing" assertion true. So this mock
 * still records args for assertions, but also performs the same outbox write
 * the real function does (single "email" channel, matching this app's
 * EVENT_CHANNELS default for cart_abandoned/checkout_abandoned), using the
 * real transaction it's handed — everything else (prefs/suppression) is out
 * of scope for this pass-level test.
 */
vi.mock("@/lib/notifications/enqueue", async () => {
  const { notificationOutbox } = await import("@/db/schema");
  return {
    enqueueNotification: async (tx: never, input: Record<string, unknown>) => {
      enqueued.push(input as never);
      const [row] = await (tx as typeof db)
        .insert(notificationOutbox)
        .values({
          recipientId: (input.recipientId as bigint | undefined) ?? null,
          recipientEmail: (input.recipientEmail as string | undefined) ?? null,
          channel: "email",
          kind: (input.kind as "transactional" | "marketing" | undefined) ?? "transactional",
          event: input.event as never,
          payload: { title: input.title, body: input.body, href: input.href ?? null, vars: input.data ?? {} },
          dedupeKey: input.dedupeKey ? `${input.dedupeKey as string}:email` : null,
        })
        .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
        .returning({ id: notificationOutbox.id });
      if (row) outboxIds.push(row.id);
    },
    enqueueStaff: async () => {},
  };
});

const { db } = await import("@/db/client");
const { carts, notificationOutbox, orders, payments, users } = await import("@/db/schema");
const { REMIND_AFTER_MS, remindAbandonedCarts, remindAbandonedOrders } = await import("../passes");

const MARK = "recovery-passes";
const HOUR = 60 * 60 * 1000;
const orderIds: bigint[] = [];
const cartIds: bigint[] = [];

beforeEach(() => {
  enqueued.length = 0;
  outboxIds.length = 0;
  process.env.RECOVERY_LINK_SECRET = "test-secret-value";
});

afterEach(async () => {
  if (outboxIds.length) {
    await db.delete(notificationOutbox).where(inArray(notificationOutbox.id, outboxIds));
    outboxIds.length = 0;
  }
  // carts.convertedOrderId FKs to orders.id — clear carts before orders/payments.
  if (cartIds.length) {
    await db.delete(carts).where(inArray(carts.id, cartIds));
    cartIds.length = 0;
  }
  if (orderIds.length) {
    await db.delete(payments).where(inArray(payments.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
    orderIds.length = 0;
  }
  await db.delete(users).where(like(users.email, `${MARK}%`));
});

/** A guest checkout that was created `ageMs` ago and never paid. */
async function pendingOrder(suffix: string, ageMs: number, status: "pending" | "paid" = "pending") {
  const createdAt = Date.now() - ageMs;
  const [row] = await db
    .insert(orders)
    .values({
      status,
      fulfillment: "pickup",
      customerName: MARK,
      customerEmail: `${MARK}-${suffix}@example.test`,
      customerPhone: "+14165550123",
      subtotal: "10.00",
      tax: "1.30",
      total: "11.30",
      pricingSnapshot: { currency: "CAD", lines: [], subtotal: 10, tax: 1.3, total: 11.3 },
      createdAt,
    })
    .returning();
  orderIds.push(row.id);
  await db.insert(payments).values({
    orderId: row.id,
    status: status === "paid" ? "paid" : "awaiting_payment",
    method: "clover",
    amount: "11.30",
  });
  return row;
}

async function cart(suffix: string, ageMs: number, email: string | null, converted = false) {
  const [row] = await db
    .insert(carts)
    .values({
      items: [{ productPublicId: "prd_a", name: "Pani puri", price: 9.5, category: "snacks", quantity: 2, modifiers: [] }],
      email,
      lastActivityAt: Date.now() - ageMs,
      convertedOrderId: converted ? orderIds[0] ?? null : null,
    })
    .returning();
  cartIds.push(row.id);
  return row;
}

describe("remindAbandonedOrders", () => {
  it("reminds a pending order older than the window, exactly once", async () => {
    const order = await pendingOrder("stale", 2 * HOUR);

    const first = await remindAbandonedOrders();
    expect(first).toBe(1);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].event).toBe("checkout_abandoned");
    expect(enqueued[0].recipientEmail).toBe(`${MARK}-stale@example.test`);
    expect(enqueued[0].dedupeKey).toBe(`${order.publicId}:checkout_abandoned`);

    // The outbox dedupe key is the stamp; a second run must find nothing.
    enqueued.length = 0;
    const second = await remindAbandonedOrders();
    expect(second).toBe(0);
    expect(enqueued).toHaveLength(0);
  });

  it("leaves a fresh pending order alone", async () => {
    await pendingOrder("fresh", REMIND_AFTER_MS / 2);
    expect(await remindAbandonedOrders()).toBe(0);
  });

  it("never reminds an order that was paid", async () => {
    await pendingOrder("paid", 2 * HOUR, "paid");
    expect(await remindAbandonedOrders()).toBe(0);
  });
});

describe("remindAbandonedCarts", () => {
  it("reminds a stale cart with an email exactly once", async () => {
    const row = await cart("stale", 2 * HOUR, `${MARK}-cart@example.test`);

    expect(await remindAbandonedCarts()).toBe(1);
    expect(enqueued[0].event).toBe("cart_abandoned");
    const [after] = await db.select().from(carts).where(eq(carts.id, row.id)).limit(1);
    expect(after.remindedAt).toBeGreaterThan(0);

    enqueued.length = 0;
    expect(await remindAbandonedCarts()).toBe(0);
  });

  it("skips a cart with no email — there is nobody to write to", async () => {
    await cart("anon", 2 * HOUR, null);
    expect(await remindAbandonedCarts()).toBe(0);
  });

  it("skips a converted cart", async () => {
    await pendingOrder("converted", 2 * HOUR);
    await cart("converted", 2 * HOUR, `${MARK}-conv@example.test`, true);
    expect(await remindAbandonedCarts()).toBe(0);
  });

  it("skips a fresh cart", async () => {
    await cart("fresh", REMIND_AFTER_MS / 2, `${MARK}-fresh@example.test`);
    expect(await remindAbandonedCarts()).toBe(0);
  });
});

describe("terminalizeAbandonedOrders", () => {
  it("fails a pending order past the terminal window and returns its coins", async () => {
    const { terminalizeAbandonedOrders } = await import("../passes");
    const { walletLedger } = await import("@/db/schema");

    const [customer] = await db
      .insert(users)
      .values({ email: `${MARK}-coins@example.test`, name: MARK, role: "user", status: "active" })
      .returning({ id: users.id });

    const order = await pendingOrder("terminal", 25 * HOUR);
    await db.update(orders).set({ userId: customer.id }).where(eq(orders.id, order.id));
    await db.insert(walletLedger).values({
      userId: customer.id, direction: "credit", sourceType: "test_seed",
      sourceId: `${MARK}-terminal`, coins: 50, memo: "seed",
    });
    await db.insert(walletLedger).values({
      userId: customer.id, direction: "debit", sourceType: "redemption",
      sourceId: order.id.toString(), coins: 5, orderId: order.id, memo: "checkout",
    });

    expect(await terminalizeAbandonedOrders()).toBe(1);

    const [after] = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    expect(after.status).toBe("failed");
    const reversal = await db
      .select()
      .from(walletLedger)
      .where(and(eq(walletLedger.sourceType, "redemption_reversal"), eq(walletLedger.sourceId, order.id.toString())));
    expect(reversal).toHaveLength(1);
    expect(reversal[0].coins).toBe(5);

    // Not usersTable: `order.userId` still points at this user, and it isn't
    // deleted until afterEach clears orders — the shared `like(email, MARK%)`
    // sweep there catches the user once that FK is gone.
    await db.delete(walletLedger).where(eq(walletLedger.userId, customer.id));
  });

  it("runs twice against the same coin-holding order without doubling the reversal", async () => {
    const { terminalizeAbandonedOrders } = await import("../passes");
    const { walletLedger } = await import("@/db/schema");
    const { walletService } = await import("@/lib/services/wallet.service");

    const [customer] = await db
      .insert(users)
      .values({ email: `${MARK}-twice@example.test`, name: MARK, role: "user", status: "active" })
      .returning({ id: users.id });

    const order = await pendingOrder("twice", 25 * HOUR);
    await db.update(orders).set({ userId: customer.id }).where(eq(orders.id, order.id));
    await db.insert(walletLedger).values({
      userId: customer.id, direction: "credit", sourceType: "test_seed",
      sourceId: `${MARK}-twice`, coins: 50, memo: "seed",
    });
    await db.insert(walletLedger).values({
      userId: customer.id, direction: "debit", sourceType: "redemption",
      sourceId: order.id.toString(), coins: 5, orderId: order.id, memo: "checkout",
    });

    // First pass: terminalizes and reverses. Second pass, no teardown in
    // between: the order is already `failed`, so the pass's own candidate
    // query excludes it — this is the property under test, run twice for real
    // rather than asserted from reading the guard.
    expect(await terminalizeAbandonedOrders()).toBe(1);
    expect(await terminalizeAbandonedOrders()).toBe(0);

    const reversal = await db
      .select()
      .from(walletLedger)
      .where(and(eq(walletLedger.sourceType, "redemption_reversal"), eq(walletLedger.sourceId, order.id.toString())));
    expect(reversal).toHaveLength(1);
    expect(await walletService.balance(customer.id)).toBe(50); // 50 seed - 5 debit + 5 reversal, not +10

    await db.delete(walletLedger).where(eq(walletLedger.userId, customer.id));
  });

  it("leaves an order inside the terminal window alone", async () => {
    const { terminalizeAbandonedOrders } = await import("../passes");
    await pendingOrder("young", 2 * HOUR);
    expect(await terminalizeAbandonedOrders()).toBe(0);
  });

  it("never terminalizes a paid order", async () => {
    const { terminalizeAbandonedOrders } = await import("../passes");
    await pendingOrder("paid-old", 25 * HOUR, "paid");
    expect(await terminalizeAbandonedOrders()).toBe(0);
  });

  it("is a clean no-op on a pending order that spent no coins", async () => {
    const { terminalizeAbandonedOrders } = await import("../passes");
    const order = await pendingOrder("nocoins", 25 * HOUR);
    expect(await terminalizeAbandonedOrders()).toBe(1);
    const [after] = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    expect(after.status).toBe("failed");
  });
});
