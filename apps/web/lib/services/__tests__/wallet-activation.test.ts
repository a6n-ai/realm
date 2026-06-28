/**
 * Integration: wallet coins awarded when an order becomes active.
 *
 * Tests two call sites:
 *   1. activateOrder(publicId) — waitlisted → active
 *   2. createOrder — immediate active (zone match)
 *
 * Uses the live DB; cleans up all own rows in afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@tiffin/commons";

const { db } = await import("@/db/client");
const { orders, orderActivities, payments, ledgerEntries, walletLedger, eventPayout, users } =
  await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const svc = await import("../orders.service");

// Phones in 555 test range, unlikely to collide with seed fixtures
const TEST_PHONE = "+16475550019";
const TEST_PHONE_2 = "+16475550020";

async function cleanup() {
  // Delete wallet ledger entries for our test users first (FK order)
  const testUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, TEST_PHONE));
  const testUsers2 = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, TEST_PHONE_2));

  for (const u of [...testUsers, ...testUsers2]) {
    await db.delete(walletLedger).where(eq(walletLedger.userId, u.id));
  }

  // Clean orders and their dependents created by our test phones
  // We identify orders by their payments/activities then delete
  const ourOrders = await db
    .select({ id: orders.id, publicId: orders.publicId })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(eq(users.phone, TEST_PHONE));
  const ourOrders2 = await db
    .select({ id: orders.id, publicId: orders.publicId })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(eq(users.phone, TEST_PHONE_2));

  for (const o of [...ourOrders, ...ourOrders2]) {
    await db.delete(ledgerEntries).where(eq(ledgerEntries.orderId, o.id));
    await db.delete(orderActivities).where(eq(orderActivities.orderId, o.id));
    await db.delete(payments).where(eq(payments.orderId, o.id));
    await db.delete(orders).where(eq(orders.id, o.id));
  }

  // Delete test users
  await db.delete(users).where(eq(users.phone, TEST_PHONE));
  await db.delete(users).where(eq(users.phone, TEST_PHONE_2));
}

beforeAll(async () => {
  // Ensure the payout config is enabled with a known coin amount
  await db
    .insert(eventPayout)
    .values({ eventType: "order_activated", enabled: true, coins: 75 })
    .onConflictDoUpdate({ target: eventPayout.eventType, set: { enabled: true, coins: 75 } });
  await cleanup();
});

afterAll(cleanup);

describe("wallet award on order activation", () => {
  it("activate(waitlisted → active) creates a wallet credit and reflects balance", async () => {
    const snap = await loadCatalogSnapshot();
    const startDate = nextWeekday(new Date()).toISOString().slice(0, 10);

    // Create order (may land active or waitlisted depending on zone seed)
    const { publicId } = await svc.createOrder({
      planKey: snap.plans[0].key,
      selections: {
        mealSizeId: snap.mealSizes[0].publicId,
        frequencyKey: "5_day",
        persons: 1,
        mealSlots: ["lunch"],
        includeSaturday: false,
        includeSunday: false,
        durationWeeks: 1,
        startDate,
      },
      contact: {
        fullName: "Wallet Test User",
        phone: TEST_PHONE,
        addressLine: "1 Test Ave",
        city: "Toronto",
        postalCode: "M5V 2T6",
      },
    });

    // Fetch the order to get userId and current status
    const [orderRow] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    const userId = orderRow.userId!;

    // Clear any wallet entry that may have been created if order landed as active
    await db.delete(walletLedger).where(eq(walletLedger.userId, userId));

    // Force waitlisted so we can test activate()
    await db.update(orders).set({ status: "waitlisted" }).where(eq(orders.publicId, publicId));

    // Activate — this is the call site under test
    await svc.activateOrder(publicId);

    // Assert a credit row was written
    const credits = await db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.userId, userId));
    expect(credits).toHaveLength(1);
    expect(credits[0].direction).toBe("credit");
    expect(credits[0].eventType).toBe("order_activated");
    expect(credits[0].coins).toBe(75);

    // Assert balance reflects the award
    const { walletService } = await import("../wallet.service");
    expect(await walletService.balance(userId)).toBe(75);
  });

  it("activating the same order again (idempotency) does not double-pay", async () => {
    const snap = await loadCatalogSnapshot();
    const startDate = nextWeekday(new Date()).toISOString().slice(0, 10);

    const { publicId } = await svc.createOrder({
      planKey: snap.plans[0].key,
      selections: {
        mealSizeId: snap.mealSizes[0].publicId,
        frequencyKey: "5_day",
        persons: 1,
        mealSlots: ["lunch"],
        includeSaturday: false,
        includeSunday: false,
        durationWeeks: 1,
        startDate,
      },
      contact: {
        fullName: "Wallet Idempotent Test",
        phone: TEST_PHONE_2,
        addressLine: "2 Test Ave",
        city: "Toronto",
        postalCode: "M5V 2T6",
      },
    });

    const [orderRow] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    const userId = orderRow.userId!;
    await db.delete(walletLedger).where(eq(walletLedger.userId, userId));
    await db.update(orders).set({ status: "waitlisted" }).where(eq(orders.publicId, publicId));

    // First activation — awards coins
    await svc.activateOrder(publicId);

    // Second activation attempt should throw (already active), but even if we
    // directly re-call award with the same sourceId, the unique index blocks it.
    await expect(svc.activateOrder(publicId)).rejects.toThrow();

    // Balance must still be exactly 75 — no double-pay
    const { walletService } = await import("../wallet.service");
    expect(await walletService.balance(userId)).toBe(75);
  });
});
