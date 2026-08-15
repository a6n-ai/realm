import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string } } }));
const clover = vi.hoisted(() => ({
  /** Cents Clover claims the cart is worth before discounts. */
  subtotalCents: 0,
  taxCents: 0,
  /** Every atomic payload the service pushed, in order. */
  payloads: [] as { discounts?: { name: string; amount: number }[] }[],
}));
const offers = vi.hoisted(() => ({ redeemable: [] as unknown[] }));

vi.mock("@/lib/auth/session", () => ({ getSession: async () => session.current }));

vi.mock("@/lib/notifications/enqueue", () => ({
  enqueueNotification: async () => {},
  enqueueStaff: async () => {},
}));

// Pickup path only. An empty type list keeps whatever pickup discount the dev
// database happens to hold out of the arithmetic under test.
vi.mock("@/lib/delivery/zones.service", () => ({
  getAllDeliveryTypes: async () => [],
  getStoreOrigin: async () => ({ lat: 0, lng: 0 }),
  getZonesWithTypes: async () => [],
}));

vi.mock("@/lib/services/inventory.service", () => ({
  inventoryCatalogService: { discounts: { listRedeemable: async () => offers.redeemable } },
}));

// Clover prices the cart, so the stub does too: it takes the discount lines out
// of the payload it is handed. That is the whole property under test — a coin
// discount that never reached this payload could not change the total.
vi.mock("@/lib/clover/client", () => ({
  createCloverClient: async () => ({
    getPakmsApiKey: async () => ({ apiAccessKey: "pakms_test" }),
    environment: () => "sandbox" as const,
    checkoutAtomicOrder: async (input: { discounts?: { name: string; amount: number }[] }) => {
      clover.payloads.push(input);
      const off = (input.discounts ?? []).reduce((s, d) => s + Math.abs(d.amount), 0);
      return {
        subtotal: clover.subtotalCents,
        totalTaxAmount: clover.taxCents,
        total: clover.subtotalCents - off + clover.taxCents,
      };
    },
    createAtomicOrder: async (input: { discounts?: { name: string; amount: number }[] }) => {
      clover.payloads.push(input);
      return { id: `clv_${Date.now()}` };
    },
  }),
}));

const { db } = await import("@/db/client");
const {
  coinRate,
  ledgerEntries,
  orderItems,
  orders,
  payments,
  products,
  users,
  walletLedger,
} = await import("@/db/schema");
const { ordersService } = await import("../orders.service");
const { walletService } = await import("../wallet.service");

const MARK = "wallet-redemption";
const userIds: bigint[] = [];
const productIds: bigint[] = [];
const rateIds: bigint[] = [];

/** $1.00 per coin keeps every expectation readable: coins spent == dollars off. */
const RATE = 1;
const UNIT_PRICE = 10;

beforeEach(async () => {
  clover.payloads.length = 0;
  clover.subtotalCents = 0;
  clover.taxCents = 0;
  offers.redeemable = [];
  session.current = null;
  const [rate] = await db
    .insert(coinRate)
    .values({ currency: "CAD", valuePerCoin: RATE.toFixed(4) })
    .returning({ id: coinRate.id });
  rateIds.push(rate.id);
});

afterEach(async () => {
  if (userIds.length) {
    const orderRows = await db
      .select({ id: orders.id })
      .from(orders)
      .where(inArray(orders.userId, userIds));
    const ids = orderRows.map((o) => o.id);
    if (ids.length) {
      await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, ids));
      await db.delete(walletLedger).where(inArray(walletLedger.orderId, ids));
      await db.delete(payments).where(inArray(payments.orderId, ids));
      await db.delete(orderItems).where(inArray(orderItems.orderId, ids));
      await db.delete(orders).where(inArray(orders.id, ids));
    }
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.userId, userIds));
    await db.delete(walletLedger).where(inArray(walletLedger.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    userIds.length = 0;
  }
  // Guest orders carry no userId — sweep them by the marked email instead.
  const guestOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.customerEmail, `${MARK}-guest@example.test`));
  if (guestOrders.length) {
    const ids = guestOrders.map((o) => o.id);
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, ids));
    await db.delete(payments).where(inArray(payments.orderId, ids));
    await db.delete(orderItems).where(inArray(orderItems.orderId, ids));
    await db.delete(orders).where(inArray(orders.id, ids));
  }
  if (productIds.length) {
    await db.delete(products).where(inArray(products.id, productIds));
    productIds.length = 0;
  }
  if (rateIds.length) {
    await db.delete(coinRate).where(inArray(coinRate.id, rateIds));
    rateIds.length = 0;
  }
});

async function insertProduct(suffix: string) {
  const [row] = await db
    .insert(products)
    .values({
      name: `${MARK}-${suffix}`,
      category: "snacks",
      price: UNIT_PRICE.toFixed(2),
      active: true,
      cloverItemId: `clover-item-${MARK}-${suffix}-${Date.now()}`,
    })
    .returning();
  productIds.push(row.id);
  return row;
}

/** A signed-in customer holding `coins`, plus an active session pointing at them. */
async function signedInCustomer(suffix: string, coins: number) {
  const [row] = await db
    .insert(users)
    .values({
      email: `${MARK}-${suffix}@example.test`,
      name: MARK,
      role: "user",
      status: "active",
    })
    .returning({ id: users.id, publicId: users.publicId });
  userIds.push(row.id);
  if (coins > 0) {
    await db.insert(walletLedger).values({
      userId: row.id,
      direction: "credit",
      sourceType: "test_seed",
      sourceId: `${MARK}-${suffix}`,
      coins,
      memo: "seed",
    });
  }
  session.current = { user: { id: row.publicId, role: "user" } };
  return row;
}

function checkoutInput(
  productPublicId: string,
  extra: { quantity?: number; coins?: number; code?: string; email?: string } = {},
) {
  return {
    items: [{ productPublicId, quantity: extra.quantity ?? 1, modifiers: [] }],
    contact: {
      name: "Ada",
      email: extra.email ?? `${MARK}-a@example.test`,
      phone: "+14165550123",
    },
    fulfillment: { type: "pickup" as const },
    discounts: { offerPublicIds: [], ...(extra.code ? { code: extra.code } : {}) },
    ...(extra.coins ? { coins: extra.coins } : {}),
  };
}

function coinLines() {
  return clover.payloads.flatMap((p) => (p.discounts ?? []).filter((d) => d.name === "Coins"));
}

describe("spending coins at checkout", () => {
  it("sends the coin discount to Clover and persists Clover's reduced total", async () => {
    const user = await signedInCustomer("a", 100);
    const product = await insertProduct("a");
    clover.subtotalCents = UNIT_PRICE * 100;

    const result = await ordersService.createCheckout(
      checkoutInput(product.publicId, { coins: 4 }),
    );

    // Both Clover calls carry it: the pricing round-trip that produces the
    // total we persist, and the create that produces the order `payOrder`
    // later bills. Same line in both — quoted equals charged.
    expect(clover.payloads).toHaveLength(2);
    expect(coinLines()).toEqual([
      { name: "Coins", amount: -400 },
      { name: "Coins", amount: -400 },
    ]);
    expect(result.total).toBe(6);
    expect(result.discountAmount).toBe(4);

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.publicId, result.orderPublicId));
    expect(Number(order.total)).toBe(6);
    expect(order.pricingSnapshot?.discountLines).toContainEqual({ name: "Coins", amount: 4 });

    const debits = await db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.orderId, order.id));
    expect(debits).toHaveLength(1);
    expect(debits[0]).toMatchObject({ direction: "debit", sourceType: "redemption", coins: 4 });
    expect(await walletService.balance(user.id)).toBe(96);
  });

  it("writes exactly one discount ledger row per discount, never the coins twice", async () => {
    await signedInCustomer("b", 100);
    const product = await insertProduct("b");
    clover.subtotalCents = UNIT_PRICE * 100;

    const result = await ordersService.createCheckout(
      checkoutInput(product.publicId, { coins: 4, email: `${MARK}-b@example.test` }),
    );
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.publicId, result.orderPublicId));

    const discountRows = await db
      .select({ amount: ledgerEntries.amount, memo: ledgerEntries.memo })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.orderId, order.id));
    // Coins were the only discount, so the coupon/delivery ledger write must
    // not fire at all — otherwise $4 off is booked as $8 of discount.
    expect(discountRows).toEqual([{ amount: "4.00", memo: "coin redemption" }]);
  });

  it("caps coins at the remaining subtotal and cannot drive the total to zero", async () => {
    await signedInCustomer("c", 1000);
    const product = await insertProduct("c");
    clover.subtotalCents = UNIT_PRICE * 100;

    // 500 coins against a $10 zero-tax cart: uncapped this is a $500 discount,
    // and even a perfect $10 discount would make Clover's total exactly zero.
    const result = await ordersService.createCheckout(
      checkoutInput(product.publicId, { coins: 500, email: `${MARK}-c@example.test` }),
    );

    expect(result.total).toBeGreaterThan(0);
    expect(result.discountAmount!).toBeLessThan(UNIT_PRICE);
    expect(coinLines()[0].amount).toBeGreaterThan(-1000);
  });

  it("stacks with a coupon without the combined discount exceeding the subtotal", async () => {
    await signedInCustomer("d", 1000);
    const product = await insertProduct("d");
    clover.subtotalCents = UNIT_PRICE * 100;
    offers.redeemable = [
      {
        publicId: "dsc_test",
        name: "Three off",
        active: true,
        publicOffer: true,
        couponCode: "THREE",
        percentage: null,
        amount: 3,
        startsAt: null,
        expiresAt: null,
        minSubtotal: null,
        stackable: true,
      },
    ];

    const result = await ordersService.createCheckout(
      checkoutInput(product.publicId, { coins: 500, code: "THREE", email: `${MARK}-d@example.test` }),
    );

    expect(result.discountAmount!).toBeLessThan(UNIT_PRICE);
    expect(result.total).toBeGreaterThan(0);
    // The coupon took $3, so the coin line can only reach the $6.99 left.
    expect(Math.abs(coinLines()[0].amount)).toBeLessThanOrEqual(699);

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.publicId, result.orderPublicId));
    const rows = await db
      .select({ amount: ledgerEntries.amount, memo: ledgerEntries.memo })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.orderId, order.id));
    // Two discounts, two rows, and their sum is the discount — not the coins
    // once in the coupon row's total and again in their own.
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.memo))).toEqual(
      new Set(["Three off (THREE)", "coin redemption"]),
    );
    expect(rows.reduce((s, r) => s + Number(r.amount), 0)).toBeCloseTo(result.discountAmount!, 2);
  });

  it("refuses to redeem for a guest rather than quietly charging full price", async () => {
    session.current = null;
    const product = await insertProduct("e");
    clover.subtotalCents = UNIT_PRICE * 100;

    await expect(
      ordersService.createCheckout(
        checkoutInput(product.publicId, { coins: 4, email: `${MARK}-guest@example.test` }),
      ),
    ).rejects.toThrow(/sign in to spend coins/i);

    expect(coinLines()).toEqual([]);
    const placed = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.customerEmail, `${MARK}-guest@example.test`));
    expect(placed).toHaveLength(0);
  });

  it("fails the checkout when the request exceeds the balance", async () => {
    const user = await signedInCustomer("f", 3);
    const product = await insertProduct("f");
    clover.subtotalCents = UNIT_PRICE * 100;

    await expect(
      ordersService.createCheckout(
        checkoutInput(product.publicId, { coins: 50, email: `${MARK}-f@example.test` }),
      ),
    ).rejects.toThrow(/insufficient coins/i);

    // Nothing was priced, nothing was written, the balance is untouched.
    expect(clover.payloads).toEqual([]);
    expect(await walletService.balance(user.id)).toBe(3);
  });
});
