/**
 * Integration: wallet coins awarded when an order becomes active.
 *
 * Tests two call sites:
 *   1. activateOrder(publicId) — waitlisted → active
 *   2. createOrder — immediate active (zone match)
 *
 * Uses the live DB; cleans up all own rows in afterAll.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { nextWeekday, ValidationError } from "@foundry/commons";

// Earn rate and wallet cap are app-wide settings in the shared test DB; writing
// them would leak into suites running in parallel, so this suite stubs them.
const settings = vi.hoisted(() => ({ pct: 10, cap: null as number | null }));
vi.mock("@/lib/services/app-settings.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/app-settings.service")>()),
  getCoinEarnPct: async () => settings.pct,
  getMaxWalletBalance: async () => settings.cap,
}));

const { db } = await import("@/db/client");
const { orders, orderActivities, payments, ledgerEntries, walletLedger, eventPayout, users, notificationOutbox } =
  await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { earnCoins } = await import("@/lib/wallet/earn-coins");
const svc = await import("../orders.service");
const { walletService } = await import("../wallet.service");

// Other suites insert their own coin_rate rows (0.5, 0.07…); pin this one's.
const RATE = 0.1;
vi.spyOn(walletService, "activeRate").mockResolvedValue(RATE);

async function expectedCoins(publicId: string) {
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  const snap = o.pricingSnapshot as { taxTotal?: number };
  return earnCoins({ total: Number(o.total), taxTotal: snap.taxTotal ?? 0, pct: 10, valuePerCoin: RATE });
}

async function notesFor(orderId: bigint) {
  const rows = await db
    .select({ note: orderActivities.note })
    .from(orderActivities)
    .where(and(eq(orderActivities.orderId, orderId), eq(orderActivities.type, "note")));
  return rows.map((r) => r.note ?? "");
}

/** Etobicoke (M9) lands active on the simulated (no payment method) path. */
async function placeActive(phone: string) {
  const snap = await loadCatalogSnapshot();
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
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: {
      email: `u${Math.random().toString(36).slice(2)}@test.invalid`,
      fullName: "Wallet Earn Test",
      phone,
      addressLine: "9 Etobicoke Ave",
      city: "Etobicoke",
      postalCode: "M9V 1A1",
    },
  });
  const [row] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  expect(row.status, "order must land active — Etobicoke zone (M9) must be seeded and active").toBe("active");
  return row;
}

// Phones in 555 test range, unlikely to collide with seed fixtures
const TEST_PHONE = "+16475550019";
const TEST_PHONE_2 = "+16475550020";
const TEST_PHONE_3 = "+16475550021";
const TEST_PHONE_4 = "+16475550022";
const TEST_PHONE_5 = "+16475550023";

const TEST_PHONE_6 = "+16475550024";
const TEST_PHONE_7 = "+16475550025";
const TEST_PHONE_8 = "+16475550026";
const TEST_PHONE_9 = "+16475550027";
const TEST_PHONE_10 = "+16475550028";

const TEST_PHONES = [TEST_PHONE, TEST_PHONE_2, TEST_PHONE_3, TEST_PHONE_4, TEST_PHONE_5, TEST_PHONE_6, TEST_PHONE_7, TEST_PHONE_8, TEST_PHONE_9, TEST_PHONE_10];

async function cleanup() {
  // Unconditional wallet clear first: a row leaked by a failed test (before the
  // scoped ids resolve) FK-blocks every later suite's `delete users`. Only the
  // two wallet suites produce these tables, so a blanket delete is safe.
  await db.delete(walletLedger);
  await db.delete(eventPayout);
  // Delete wallet ledger entries for our test users first (FK order)
  const testUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.phone, TEST_PHONES));

  for (const u of testUsers) {
    await db.delete(walletLedger).where(eq(walletLedger.userId, u.id));
    await db.delete(notificationOutbox).where(eq(notificationOutbox.recipientId, u.id));
  }

  // Clean orders and their dependents created by our test phones
  // We identify orders by their payments/activities then delete
  const ourOrders = await db
    .select({ id: orders.id, publicId: orders.publicId })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(inArray(users.phone, TEST_PHONES));

  for (const o of ourOrders) {
    await db.delete(ledgerEntries).where(eq(ledgerEntries.orderId, o.id));
    await db.delete(orderActivities).where(eq(orderActivities.orderId, o.id));
    await db.delete(payments).where(eq(payments.orderId, o.id));
    await db.delete(orders).where(eq(orders.id, o.id));
  }

  // Delete test users
  await db.delete(users).where(inArray(users.phone, TEST_PHONES));
}

beforeAll(cleanup);

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
      contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`, 
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
    const expected = await expectedCoins(publicId);
    expect(expected).toBeGreaterThan(0);
    expect(credits[0].coins).toBe(expected);
    expect(await walletService.balance(userId)).toBe(expected);
  });

  it("createOrder (status=active) immediately awards wallet coins", async () => {
    const snap = await loadCatalogSnapshot();
    const startDate = nextWeekday(new Date()).toISOString().slice(0, 10);

    // M9V 1A1 — Etobicoke zone (prefix M9), present in catalog seed.
    // If no matching active zone exists, the order lands "waitlisted" and the
    // award path under test never fires — the assertion below catches that.
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
      contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`, 
        fullName: "Wallet CreateOrder Test",
        phone: TEST_PHONE_3,
        addressLine: "9 Etobicoke Ave",
        city: "Etobicoke",
        postalCode: "M9V 1A1",
      },
    });

    const [orderRow] = await db.select().from(orders).where(eq(orders.publicId, publicId));

    // Hard guard: status must be "active" for the award path to have fired.
    // If this fails, check that the Etobicoke zone (prefix M9) is seeded and active.
    expect(orderRow.status, "order must land active — Etobicoke zone (M9) must be seeded and active").toBe("active");

    const userId = orderRow.userId!;
    const credits = await db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.userId, userId));
    expect(credits).toHaveLength(1);
    expect(credits[0].direction).toBe("credit");
    expect(credits[0].eventType).toBe("order_activated");
    const expected = await expectedCoins(publicId);
    expect(credits[0].coins).toBe(expected);
    expect(await walletService.balance(userId)).toBe(expected);
  });

  it("cancelling a paid order takes back the coins it earned", async () => {
    const snap = await loadCatalogSnapshot();
    // Same test phone as the order above: start after its plan so they don't overlap.
    const startDate = nextWeekday(new Date(Date.now() + 21 * 86_400_000)).toISOString().slice(0, 10);
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
        email: `u${Math.random().toString(36).slice(2)}@test.invalid`,
        fullName: "Wallet Cancel Test",
        phone: TEST_PHONE_3,
        addressLine: "9 Etobicoke Ave",
        city: "Etobicoke",
        postalCode: "M9V 1A1",
      },
    });
    const [orderRow] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    expect(orderRow.status).toBe("active");
    // Earlier tests may share this customer (same phone), so compare against this order's own award.
    const withAward = await walletService.balance(orderRow.userId!);
    const expected = await expectedCoins(publicId);
    const earned = await db.select().from(walletLedger).where(eq(walletLedger.sourceId, publicId));
    expect(earned.map((r) => r.coins)).toEqual([expected]);

    await svc.cancelOrder(publicId);
    expect(await walletService.balance(orderRow.userId!)).toBe(withAward - expected);
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
      contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`, 
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

    // No double-pay
    expect(await walletService.balance(userId)).toBe(await expectedCoins(publicId));
  });
});

describe("refundOrder", () => {
  it("reverses previously-awarded wallet coins and marks the payment refunded", async () => {
    const snap = await loadCatalogSnapshot();
    const startDate = nextWeekday(new Date()).toISOString().slice(0, 10);

    // M9V 1A1 — Etobicoke zone (prefix M9): lands "active" immediately, which
    // is what fires createOrder's award() call site (orders.service.ts:487).
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
      contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`,
        fullName: "Wallet Refund Test",
        phone: TEST_PHONE_4,
        addressLine: "9 Etobicoke Ave",
        city: "Etobicoke",
        postalCode: "M9V 1A1",
      },
    });

    const [orderRow] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    expect(orderRow.status, "order must land active for the award path to have fired").toBe("active");
    const userId = orderRow.userId!;

    expect(await walletService.balance(userId)).toBe(await expectedCoins(publicId));

    await svc.refundOrder(publicId);

    expect(await walletService.balance(userId)).toBe(0);
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, orderRow.id));
    expect(pay.status).toBe("refunded");
  });

  it("is idempotent — calling it twice does not double-reverse", async () => {
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
      contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`,
        fullName: "Wallet Refund Idempotent Test",
        phone: TEST_PHONE_5,
        addressLine: "9 Etobicoke Ave",
        city: "Etobicoke",
        postalCode: "M9V 1A1",
      },
    });

    const [orderRow] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    expect(orderRow.status).toBe("active");
    const userId = orderRow.userId!;

    expect(await walletService.balance(userId)).toBe(await expectedCoins(publicId));

    await svc.refundOrder(publicId);
    expect(await walletService.balance(userId)).toBe(0);

    // Second refundOrder call throws (payment no longer settled) but must not
    // touch the wallet a second time even if the reversal step were re-run.
    await expect(svc.refundOrder(publicId)).rejects.toThrow();
    expect(await walletService.balance(userId)).toBe(0);
  });
});

describe("percent earn edge cases", () => {
  it("skips the award at the wallet cap, keeps the order, and notes why", async () => {
    settings.cap = 1;
    try {
      const row = await placeActive(TEST_PHONE_6);
      expect(await db.select().from(walletLedger).where(eq(walletLedger.sourceId, row.publicId))).toHaveLength(0);
      expect((await notesFor(row.id)).some((n) => n.includes("wallet cap"))).toBe(true);
    } finally {
      settings.cap = null;
    }
  });

  it("skips the award when no coin value is set, and notes why", async () => {
    vi.mocked(walletService.activeRate).mockRejectedValueOnce(new ValidationError("No coin rate for CAD"));
    const row = await placeActive(TEST_PHONE_7);
    expect(await db.select().from(walletLedger).where(eq(walletLedger.sourceId, row.publicId))).toHaveLength(0);
    expect((await notesFor(row.id)).some((n) => n.includes("coin value"))).toBe(true);
  });

  it("verifying the same payment twice awards once", async () => {
    // The test DB has no payment rail enabled, so checkout is simulated-paid;
    // put the payment back to awaiting, as a real e-Transfer order would be.
    const row = await placeActive(TEST_PHONE_8);
    await db.delete(walletLedger).where(eq(walletLedger.sourceId, row.publicId));
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, row.id));
    await db.update(payments).set({ status: "awaiting_payment" }).where(eq(payments.id, pay.id));

    await svc.verifyPayment(pay.publicId);
    await svc.verifyPayment(pay.publicId);

    const credits = await db
      .select()
      .from(walletLedger)
      .where(and(eq(walletLedger.sourceId, row.publicId), eq(walletLedger.direction, "credit")));
    expect(credits.map((c) => c.coins)).toEqual([await expectedCoins(row.publicId)]);
  });

  it("earns nothing, silently, when nothing was paid before tax", async () => {
    const row = await placeActive(TEST_PHONE_9);
    await db.delete(walletLedger).where(eq(walletLedger.sourceId, row.publicId));
    const taxTotal = (row.pricingSnapshot as { taxTotal?: number }).taxTotal ?? 0;
    await db.update(orders).set({ status: "waitlisted", total: String(taxTotal) }).where(eq(orders.id, row.id));

    await svc.activateOrder(row.publicId);

    expect(await db.select().from(walletLedger).where(eq(walletLedger.sourceId, row.publicId))).toHaveLength(0);
    expect(await notesFor(row.id)).toEqual([]);
  });

  it("activating while the payment is verified still awards exactly once", async () => {
    // Race: activate reads the payment as unpaid while verify reads the order as
    // waitlisted, so neither awards. Several rounds to give the race a chance.
    for (let i = 0; i < 6; i++) {
      const snap = await loadCatalogSnapshot();
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
          startDate: nextWeekday(new Date(Date.now() + i * 14 * 86_400_000)).toISOString().slice(0, 10),
        },
        contact: {
          email: `u${Math.random().toString(36).slice(2)}@test.invalid`,
          fullName: "Wallet Race Test",
          phone: TEST_PHONE_10,
          addressLine: "9 Etobicoke Ave",
          city: "Etobicoke",
          postalCode: "M9V 1A1",
        },
      });
      const [row] = await db.select().from(orders).where(eq(orders.publicId, publicId));
      await db.delete(walletLedger).where(eq(walletLedger.sourceId, publicId));
      await db.update(orders).set({ status: "waitlisted" }).where(eq(orders.id, row.id));
      const [pay] = await db.select().from(payments).where(eq(payments.orderId, row.id));
      await db.update(payments).set({ status: "awaiting_payment" }).where(eq(payments.id, pay.id));

      await Promise.all([svc.activateOrder(publicId), svc.verifyPayment(pay.publicId)]);

      const credits = await db.select().from(walletLedger).where(eq(walletLedger.sourceId, publicId));
      expect(credits, `round ${i}`).toHaveLength(1);
    }
  });
});

