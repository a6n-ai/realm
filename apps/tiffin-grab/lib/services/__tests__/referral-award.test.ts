/**
 * Integration: referral coins on the friend's first paid order, and take-back
 * on refund/cancel. Live test DB; cleans up its own rows.
 *
 * The test DB has no payment rail, so checkout is simulated-paid and the award
 * fires at createOrder. Tests that need an unpaid order put it back with
 * `backToUnpaid`, as a real e-Transfer order would sit.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, or } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

// App-wide settings in the shared test DB; stubbed so nothing leaks between suites.
const DEFAULT_REFERRAL = { mode: "flat" as "flat" | "pct", referrerValue: 20, friendValue: 10, maxPerReferrer: null as number | null };
const settings = vi.hoisted(() => ({
  earnPct: 0,
  cap: null as number | null,
  referral: { mode: "flat" as "flat" | "pct", referrerValue: 20, friendValue: 10, maxPerReferrer: null as number | null },
}));
vi.mock("@/lib/services/app-settings.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/app-settings.service")>()),
  getCoinEarnPct: async () => settings.earnPct,
  getMaxWalletBalance: async () => settings.cap,
  getReferralSettings: async () => settings.referral,
}));

const { db } = await import("@/db/client");
const { orders, orderActivities, payments, ledgerEntries, walletLedger, users, referrals, notificationOutbox } =
  await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { referralCoins } = await import("@/lib/referrals/reward");
const svc = await import("../orders.service");
const { walletService } = await import("../wallet.service");
const { attachReferral, getOrCreateReferralCode, getReferralSummary } = await import("../referrals.service");

const RATE = 0.1;
vi.spyOn(walletService, "activeRate").mockResolvedValue(RATE);

const PHONES = Array.from({ length: 33 }, (_, i) => `+164755500${50 + i}`);
const phone = (n: number) => `+164755500${n}`;

afterEach(() => {
  settings.earnPct = 0;
  settings.cap = null;
  settings.referral = { ...DEFAULT_REFERRAL };
});

async function cleanup() {
  const ours = await db.select({ id: users.id }).from(users).where(inArray(users.phone, PHONES));
  const ids = ours.map((u) => u.id);
  if (ids.length === 0) return;
  await db.delete(referrals).where(or(inArray(referrals.referrerUserId, ids), inArray(referrals.referredUserId, ids)));
  await db.update(users).set({ referredByUserId: null }).where(inArray(users.id, ids));
  await db.delete(walletLedger).where(inArray(walletLedger.userId, ids));
  await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, ids));
  const os = await db.select({ id: orders.id }).from(orders).where(inArray(orders.userId, ids));
  for (const o of os) {
    await db.delete(ledgerEntries).where(eq(ledgerEntries.orderId, o.id));
    await db.delete(orderActivities).where(eq(orderActivities.orderId, o.id));
    await db.delete(payments).where(eq(payments.orderId, o.id));
    await db.delete(orders).where(eq(orders.id, o.id));
  }
  await db.delete(users).where(inArray(users.id, ids));
}
beforeAll(cleanup);
afterAll(cleanup);

async function makeUser(n: number) {
  const [u] = await db
    .insert(users)
    .values({ phone: phone(n), email: `rf${n}@test.invalid`, name: `Name${n} Tester`, role: "user" })
    .returning({ id: users.id });
  return u.id;
}

async function refer(referrerN: number, friendN: number, existingReferrer?: bigint) {
  const referrer = existingReferrer ?? (await makeUser(referrerN));
  const friend = await makeUser(friendN);
  expect(await attachReferral(friend, await getOrCreateReferralCode(referrer))).toBe("attached");
  return { referrer, friend };
}

/** Etobicoke lands active and simulated-paid. `slot` spaces plans two weeks apart (no overlap). */
async function placeFor(n: number, slot = 0) {
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
      startDate: nextWeekday(new Date(Date.now() + slot * 14 * 86_400_000)).toISOString().slice(0, 10),
    },
    contact: { email: `rf${n}@test.invalid`, fullName: `Name${n} Tester`, phone: phone(n), addressLine: "9 Etobicoke Ave", city: "Etobicoke", postalCode: "M9V 1A1" },
  });
  const [row] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return row;
}

async function rowFor(friend: bigint) {
  const [r] = await db.select().from(referrals).where(eq(referrals.referredUserId, friend));
  return r;
}

async function creditsFor(friend: bigint) {
  const r = await rowFor(friend);
  return db.select().from(walletLedger).where(and(inArray(walletLedger.sourceType, ["referral", "referral_reversal"]), eq(walletLedger.sourceId, r.publicId)));
}

const side = (rows: { eventType: string | null; direction: string; coins: number }[], ev: string, dir = "credit") =>
  rows.filter((r) => r.eventType === ev && r.direction === dir).map((r) => r.coins);

/** Undo the create-time award and leave the order unpaid, like a pending e-Transfer. */
async function backToUnpaid(friend: bigint, order: { id: bigint }, opts: { waitlisted?: boolean } = {}) {
  const r = await rowFor(friend);
  await db.delete(walletLedger).where(and(eq(walletLedger.sourceType, "referral"), eq(walletLedger.sourceId, r.publicId)));
  await db.update(referrals).set({ status: "joined", qualifyingOrderId: null, referrerCoins: 0, friendCoins: 0, skipReason: null }).where(eq(referrals.id, r.id));
  await db.update(payments).set({ status: "awaiting_payment" }).where(eq(payments.orderId, order.id));
  if (opts.waitlisted) await db.update(orders).set({ status: "waitlisted" }).where(eq(orders.id, order.id));
  const [pay] = await db.select().from(payments).where(eq(payments.orderId, order.id));
  return pay;
}

describe("referral award", () => {
  it("pays both sides on the friend's first paid order and notes it on the order", async () => {
    const { friend } = await refer(50, 51);
    const order = await placeFor(51);
    const rows = await creditsFor(friend);
    expect(side(rows, "referral_friend")).toEqual([10]);
    expect(side(rows, "referral_referrer")).toEqual([20]);
    const r = await rowFor(friend);
    expect(r).toMatchObject({ status: "rewarded", friendCoins: 10, referrerCoins: 20, qualifyingOrderId: order.id });
    const notes = await db.select({ note: orderActivities.note }).from(orderActivities).where(eq(orderActivities.orderId, order.id));
    expect(notes.some((n) => n.note?.startsWith("Referral:"))).toBe(true);
  });

  it("percent mode pays a share of the first order before tax", async () => {
    settings.referral = { mode: "pct", referrerValue: 10, friendValue: 5, maxPerReferrer: null };
    const { friend } = await refer(52, 53);
    const order = await placeFor(53);
    const taxTotal = (order.pricingSnapshot as { taxTotal?: number }).taxTotal ?? 0;
    const at = (value: number) => referralCoins({ mode: "pct", value, total: Number(order.total), taxTotal, valuePerCoin: RATE });
    const rows = await creditsFor(friend);
    expect(side(rows, "referral_referrer")).toEqual([at(10)]);
    expect(side(rows, "referral_friend")).toEqual([at(5)]);
  });

  it("pays nothing more on the friend's second order", async () => {
    const { friend } = await refer(54, 55);
    await placeFor(55, 0);
    await placeFor(55, 1);
    const rows = await creditsFor(friend);
    expect(side(rows, "referral_friend")).toEqual([10]);
    expect(side(rows, "referral_referrer")).toEqual([20]);
  });

  it("stops paying the referrer at the cap, and a refunded referral frees its slot", async () => {
    settings.referral = { ...DEFAULT_REFERRAL, maxPerReferrer: 1 };
    const { referrer, friend: f1 } = await refer(56, 57);
    const o1 = await placeFor(57);
    expect((await rowFor(f1)).status).toBe("rewarded");

    const { friend: f2 } = await refer(0, 58, referrer);
    await placeFor(58);
    const rows2 = await creditsFor(f2);
    expect(side(rows2, "referral_friend")).toEqual([10]);
    expect(side(rows2, "referral_referrer")).toEqual([]);
    expect((await rowFor(f2)).skipReason).toBe("cap");

    await svc.refundOrder(o1.publicId);
    expect((await rowFor(f1)).status).toBe("reversed");

    const { friend: f3 } = await refer(0, 59, referrer);
    await placeFor(59);
    expect(side(await creditsFor(f3), "referral_referrer")).toEqual([20]);
  });

  it("skips the referrer when the coins would pass the wallet cap", async () => {
    settings.cap = 15;
    const { friend } = await refer(60, 61);
    await placeFor(61);
    const rows = await creditsFor(friend);
    expect(side(rows, "referral_friend")).toEqual([10]);
    expect(side(rows, "referral_referrer")).toEqual([]);
    expect((await rowFor(friend)).skipReason).toBe("wallet_cap");
  });

  it("still rewards the friend when the referrer was deactivated", async () => {
    const { referrer, friend } = await refer(62, 63);
    await db.update(users).set({ status: "inactive" }).where(eq(users.id, referrer));
    await placeFor(63);
    const rows = await creditsFor(friend);
    expect(side(rows, "referral_friend")).toEqual([10]);
    expect(side(rows, "referral_referrer")).toEqual([]);
    expect((await rowFor(friend)).skipReason).toBe("referrer_inactive");
  });

  it("verifying the same payment twice pays each side once", async () => {
    const { friend } = await refer(64, 65);
    const order = await placeFor(65);
    const pay = await backToUnpaid(friend, order);
    await svc.verifyPayment(pay.publicId);
    await svc.verifyPayment(pay.publicId);
    const rows = await creditsFor(friend);
    expect(side(rows, "referral_friend")).toEqual([10]);
    expect(side(rows, "referral_referrer")).toEqual([20]);
  });

  it("activating while the payment is verified pays each side once", async () => {
    for (const [a, b] of [[66, 67], [68, 69], [70, 71]]) {
      const { friend } = await refer(a, b);
      const order = await placeFor(b);
      const pay = await backToUnpaid(friend, order, { waitlisted: true });
      await Promise.all([svc.activateOrder(order.publicId), svc.verifyPayment(pay.publicId)]);
      const rows = await creditsFor(friend);
      expect(side(rows, "referral_friend"), `pair ${a}`).toEqual([10]);
      expect(side(rows, "referral_referrer"), `pair ${a}`).toEqual([20]);
    }
  });

  it("two chained referrals paid at once both complete (A→B, B→C)", async () => {
    const { referrer: b, friend: _b } = await refer(72, 73);
    const { friend: c } = await refer(0, 74, _b);
    const ob = await placeFor(73);
    const oc = await placeFor(74);
    const pb = await backToUnpaid(_b, ob);
    const pc = await backToUnpaid(c, oc);
    await Promise.all([svc.verifyPayment(pb.publicId), svc.verifyPayment(pc.publicId)]);
    expect(side(await creditsFor(_b), "referral_referrer")).toEqual([20]);
    expect(side(await creditsFor(c), "referral_referrer")).toEqual([20]);
    expect(b).toBeDefined();
  });

  it("an unpaid order pays nothing until its payment is verified", async () => {
    const { friend } = await refer(75, 76);
    const order = await placeFor(76);
    const pay = await backToUnpaid(friend, order);
    expect(await creditsFor(friend)).toHaveLength(0);
    await svc.verifyPayment(pay.publicId);
    expect(side(await creditsFor(friend), "referral_friend")).toEqual([10]);
  });

  it("cancelling the qualifying order takes both rewards back, for good", async () => {
    const { friend } = await refer(77, 78);
    const order = await placeFor(78);
    await svc.cancelOrder(order.publicId);
    const rows = await creditsFor(friend);
    expect(side(rows, "referral_friend", "debit")).toEqual([10]);
    expect(side(rows, "referral_referrer", "debit")).toEqual([20]);
    expect((await rowFor(friend)).status).toBe("reversed");
    await placeFor(78, 1);
    expect(side(await creditsFor(friend), "referral_friend")).toEqual([10]);
  });

  it("pays nothing when referrals are off", async () => {
    settings.referral = { ...DEFAULT_REFERRAL, referrerValue: 0, friendValue: 0 };
    const { friend } = await refer(79, 80);
    await placeFor(80);
    expect(await creditsFor(friend)).toHaveLength(0);
    expect(await rowFor(friend)).toMatchObject({ status: "ordered", skipReason: "off" });
  });
});

describe("getReferralSummary", () => {
  it("lists the referrer's friends with first name + initial, status, and total coins", async () => {
    const { referrer } = await refer(81, 82);
    await placeFor(82);
    const s = await getReferralSummary(referrer);
    expect(s.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(s.totalCoins).toBe(20);
    expect(s.friends).toEqual([expect.objectContaining({ name: "Name82 T.", status: "rewarded" })]);
    expect(s.settings).toEqual(settings.referral);
  });
});
