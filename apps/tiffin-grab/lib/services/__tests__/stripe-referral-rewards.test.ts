import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const status = vi.fn();
vi.mock("@/lib/payments/stripe", async (orig) => ({
  ...(await orig<object>()),
  stripeRuntime: async () => ({
    stripe: {},
    cfg: { surcharge: { enabled: false, ratePct: 0, excludeProvinces: [], networksNotifiedOn: "2026-09-01" }, tax: { enabled: false, taxCode: "txcd_x", surchargeTaxable: false } },
  }),
}));
vi.mock("@foundry/payments/stripe", async (orig) => ({ ...(await orig<object>()), fetchIntentStatus: (...a: unknown[]) => status(...a) }));
vi.mock("@/lib/services/app-settings.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/app-settings.service")>()),
  getCoinEarnPct: async () => 10,
  getReferralSettings: async () => ({ mode: "flat", referrerValue: 20, friendValue: 10, maxPerReferrer: null }),
}));

const { db } = await import("@/db/client");
const { orders, payments, referrals, users, walletLedger } = await import("@/db/schema");
const { settleStripePayment, recordStripeRefund } = await import("../payment-stripe");
const { activateOrder, createOrder, verifyPayment } = await import("../orders.service");
const { walletService } = await import("../wallet.service");
const { attachReferral, getOrCreateReferralCode } = await import("../referrals.service");
const { setPaymentConfig } = await import("../app-settings.service");
const { sharedCache } = await import("@/lib/cache");
const { baseInput, reset, cleanup } = await import("./stripe-fixture");

vi.spyOn(walletService, "activeRate").mockResolvedValue(0.1);

// The friend must be referred before their first order, so the account exists first (orders find it by phone).
async function refer(phone = "+16475550999") {
  const [f] = await db.insert(users).values({ phone, email: "friend@test.invalid", name: "Fri End", role: "user", emailVerified: true }).returning({ id: users.id });
  const friendId = f!.id;
  const [r] = await db.insert(users).values({ phone: "+16475550777", email: "ref@test.invalid", name: "Ref Erer", role: "user", emailVerified: true }).returning({ id: users.id });
  expect(await attachReferral(friendId, await getOrCreateReferralCode(r!.id))).toBe("attached");
}
const referral = async () => (await db.select().from(referrals))[0]!;
const rewards = async () =>
  db.select().from(walletLedger).where(and(eq(walletLedger.sourceType, "referral"), eq(walletLedger.direction, "credit")));
const orderCoins = async (_orderPublicId?: string) =>
  db.select().from(walletLedger).where(eq(walletLedger.eventType, "order_activated"));

async function clean() {
  await db.delete(referrals);
  await db.update(users).set({ referredByUserId: null });
  await reset();
}

describe("Stripe order rewards", () => {
  beforeEach(async () => {
    await clean();
    await setPaymentConfig({
      methods: [
        { id: "etransfer", kind: "manual", enabled: true, label: "e-Transfer", payeeHandle: "p@x.ca", taxes: [] },
        { id: "stripe", kind: "online", enabled: true, label: "Card", taxes: [] },
      ],
    });
    await sharedCache("app-settings").evictAll();
    status.mockReset();
  });
  afterAll(async () => {
    await clean();
    await cleanup();
  });

  it("staff starting a paid, stranded card order awards the referral once", async () => {
    await refer();
    const input = await baseInput({ paymentMethodId: "stripe" });
    const { publicId } = await createOrder(input);
    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));
    await db.update(payments).set({ providerRef: "pi_1" }).where(eq(payments.id, pay!.id));
    status.mockResolvedValue({ piId: "pi_1", status: "succeeded", amountReceivedCents: Math.round(Number(pay!.amount) * 100), currency: "cad", paymentRef: pay!.publicId, created: 1 });
    const other = await createOrder({ ...input, couponCode: null, paymentMethodId: "etransfer" });
    await settleStripePayment({ paymentRef: pay!.publicId }, "webhook", "evt_1");
    expect((await referral()).status).toBe("joined");

    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.publicId, other.publicId));
    await activateOrder(publicId);
    expect((await referral()).status).toBe("rewarded");
    expect(await rewards()).toHaveLength(2);

    await expect(activateOrder(publicId)).rejects.toThrow();
    await verifyPayment(pay!.publicId).catch(() => {});
    expect(await rewards()).toHaveLength(2);
    expect(await orderCoins(publicId)).toHaveLength(1);
  });

  it("a full refund of an add-on payment leaves the plan's coins and referral alone", async () => {
    await refer();
    const { publicId } = await createOrder(await baseInput({ paymentMethodId: "etransfer" }));
    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    const [plan] = await db.select().from(payments).where(eq(payments.orderId, order!.id));
    await verifyPayment(plan!.publicId);
    expect((await referral()).status).toBe("rewarded");
    const coinsBefore = await orderCoins(publicId);
    expect(coinsBefore).toHaveLength(1);

    await db.insert(payments).values({
      orderId: order!.id, status: "paid", method: "stripe", amount: "15.00", providerRef: "pi_addon",
      addonRequest: { selections: [], taxes: [], openTiffins: 5, lines: [], addonSubtotal: 15, taxTotal: 0, amountDue: 15, quotedAt: 1 },
    });
    await recordStripeRefund({ piId: "pi_addon", eventId: "evt_a", amountRefundedCents: 1500, fullyRefunded: true });
    expect((await referral()).status).toBe("rewarded");
    expect(await orderCoins(publicId)).toEqual(coinsBefore);

    await db.update(payments).set({ method: "stripe", providerRef: "pi_plan", status: "paid" }).where(eq(payments.id, plan!.id));
    await recordStripeRefund({ piId: "pi_plan", eventId: "evt_p", amountRefundedCents: Math.round(Number(plan!.amount) * 100), fullyRefunded: true });
    expect((await referral()).status).toBe("reversed");
    expect((await orderCoins(publicId)).some((r) => r.direction === "debit")).toBe(true);
  });
});
