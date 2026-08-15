import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  eventPayout,
  ledgerEntries,
  notificationOutbox,
  orders,
  payments,
  users,
  walletLedger,
  type OrderPricingSnapshot,
} from "@/db/schema";
import { ordersService } from "../orders.service";

const MARK = "wallet-earning";
const userIds: bigint[] = [];
const orderIds: bigint[] = [];

afterEach(async () => {
  await db.delete(eventPayout).where(eq(eventPayout.eventType, "order_paid"));
  if (orderIds.length) {
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, orderIds));
    await db.delete(walletLedger).where(inArray(walletLedger.orderId, orderIds));
    await db.delete(payments).where(inArray(payments.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
    orderIds.length = 0;
  }
  if (userIds.length) {
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.userId, userIds));
    await db.delete(walletLedger).where(inArray(walletLedger.userId, userIds));
    await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    userIds.length = 0;
  }
});

const pricingSnapshot: OrderPricingSnapshot = {
  currency: "CAD",
  lines: [],
  subtotal: 10,
  tax: 0,
  total: 10,
};

async function insertUser(suffix: string) {
  const [row] = await db
    .insert(users)
    .values({ email: `${MARK}-${suffix}@example.test`, name: MARK, role: "user", status: "active" })
    .returning({ id: users.id });
  userIds.push(row.id);
  return row.id;
}

async function insertOrder(userId: bigint | null, suffix: string) {
  const [order] = await db
    .insert(orders)
    .values({
      userId,
      status: "pending",
      customerName: MARK,
      customerEmail: `${MARK}-${suffix}@example.test`,
      customerPhone: "5555550100",
      subtotal: "10.00",
      tax: "0.00",
      total: "10.00",
      pricingSnapshot,
    })
    .returning();
  orderIds.push(order.id);
  const [pay] = await db
    .insert(payments)
    .values({ orderId: order.id, status: "awaiting_payment", amount: "10.00" })
    .returning();
  return { order, pay };
}

async function enablePayout(coins: number) {
  await db
    .insert(eventPayout)
    .values({ eventType: "order_paid", enabled: true, coins })
    .onConflictDoUpdate({ target: eventPayout.eventType, set: { enabled: true, coins } });
}

// Exercises the exact private methods `applyRemotePaymentStatus`/`payCheckout`
// call, without dragging in Clover client mocking — settlePaid's contract
// with the DB is what's under test, not the Clover HTTP layer.
async function settle(order: (typeof orders)["$inferSelect"]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = ordersService as any;
  await db.transaction((tx) => service.settlePaid(tx, order, "chg_test", 1000));
  await service.awardOrderPaid(order);
}

describe("coin award on payment settlement", () => {
  it("awards order_paid coins when the payout is enabled", async () => {
    await enablePayout(5);
    const userId = await insertUser("a");
    const { order } = await insertOrder(userId, "a");

    await settle(order);

    const rows = await db.select().from(walletLedger).where(eq(walletLedger.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      direction: "credit",
      eventType: "order_paid",
      coins: 5,
      sourceType: "order",
      sourceId: order.publicId,
    });
  });

  it("awards nothing for a guest order (null userId) and does not throw", async () => {
    await enablePayout(5);
    const { order } = await insertOrder(null, "guest");

    await expect(settle(order)).resolves.not.toThrow();

    const rows = await db.select().from(walletLedger).where(eq(walletLedger.orderId, order.id));
    expect(rows).toHaveLength(0);
  });

  it("awards nothing when the payout is disabled", async () => {
    await db
      .insert(eventPayout)
      .values({ eventType: "order_paid", enabled: false, coins: 5 })
      .onConflictDoUpdate({ target: eventPayout.eventType, set: { enabled: false, coins: 5 } });
    const userId = await insertUser("b");
    const { order } = await insertOrder(userId, "b");

    await settle(order);

    const rows = await db.select().from(walletLedger).where(eq(walletLedger.userId, userId));
    expect(rows).toHaveLength(0);
  });

  it("awards nothing when the payout is enabled but zero coins", async () => {
    await enablePayout(0);
    const userId = await insertUser("c");
    const { order } = await insertOrder(userId, "c");

    await settle(order);

    const rows = await db.select().from(walletLedger).where(eq(walletLedger.userId, userId));
    expect(rows).toHaveLength(0);
  });

  it("is a no-op on a repeat award for the same order (idempotency index)", async () => {
    await enablePayout(5);
    const userId = await insertUser("d");
    const { order } = await insertOrder(userId, "d");

    // Simulates a double confirmation (webhook + admin check-status) landing
    // on the same already-settled order.
    await settle(order);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ordersService as any).awardOrderPaid(order);

    const rows = await db.select().from(walletLedger).where(eq(walletLedger.userId, userId));
    expect(rows).toHaveLength(1);
  });
});
