/**
 * Integration: referral codes and attaching a friend to a referrer.
 * Live test DB; cleans up its own rows.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, or } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

const { db } = await import("@/db/client");
const { orders, orderActivities, payments, ledgerEntries, walletLedger, users, referrals, notificationOutbox } =
  await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const ordersSvc = await import("../orders.service");
const { attachOnSignIn, attachReferral, getOrCreateReferralCode, normalizeReferralCode } = await import("../referrals.service");

const PHONES = [...Array.from({ length: 10 }, (_, i) => `+164755500${40 + i}`), "+16475550036", "+16475550037", "+16475550038", "+16475550033", "+16475550034", "+16475550035", "+16475550032", "+16475550030", "+16475550031", "+16475550026", "+16475550027", "+16475550028", "+16475550029", "+16475550022", "+16475550023", "+16475550024"];

async function makeUser(phone: string, role: "user" | "admin" = "user") {
  const [u] = await db
    .insert(users)
    .values({ phone, email: `ref${phone.slice(-4)}@test.invalid`, name: `Ref ${phone.slice(-2)} Tester`, role, emailVerified: true })
    .returning({ id: users.id });
  return u.id;
}

/** A customer with a simulated-paid order (Etobicoke lands active, no rail = simulated). */
async function makePaidCustomer(phone: string) {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await ordersSvc.createOrder({
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
    contact: { email: `ref${phone.slice(-4)}@test.invalid`, fullName: "Ref Paid", phone, addressLine: "9 Etobicoke Ave", city: "Etobicoke", postalCode: "M9V 1A1" },
  });
  const [o] = await db.select({ userId: orders.userId }).from(orders).where(eq(orders.publicId, publicId));
  // Verified, so these tests isolate the order-history rule from the verified-email rule.
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, o.userId!));
  return o.userId!;
}

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
    const pays = await db.select({ id: payments.id }).from(payments).where(eq(payments.orderId, o.id));
    await db.delete(ledgerEntries).where(eq(ledgerEntries.orderId, o.id));
    if (pays.length) await db.delete(ledgerEntries).where(inArray(ledgerEntries.paymentId, pays.map((p) => p.id)));
    await db.delete(orderActivities).where(eq(orderActivities.orderId, o.id));
    await db.delete(payments).where(eq(payments.orderId, o.id));
    await db.delete(orders).where(eq(orders.id, o.id));
  }
  await db.delete(users).where(inArray(users.id, ids));
}

beforeAll(cleanup);
afterAll(cleanup);

async function rowFor(userId: bigint) {
  const [r] = await db.select().from(referrals).where(eq(referrals.referredUserId, userId));
  return r;
}

describe("referral codes", () => {
  it("makes one stable, readable code per customer", async () => {
    const id = await makeUser(PHONES[0]);
    const a = await getOrCreateReferralCode(id);
    expect(a).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(await getOrCreateReferralCode(id)).toBe(a);
  });

  it("normalizes what people type", () => {
    expect(normalizeReferralCode("  ab cd 23 ")).toBe("ABCD23");
  });
});

describe("attachReferral", () => {
  it("attaches a new customer, whatever case and spacing they typed", async () => {
    const referrer = await makeUser(PHONES[1]);
    const friend = await makeUser(PHONES[2]);
    const code = await getOrCreateReferralCode(referrer);
    const typed = ` ${code.slice(0, 4).toLowerCase()} ${code.slice(4)} `;
    expect(await attachReferral(friend, typed)).toBe("attached");
    const [u] = await db.select({ by: users.referredByUserId }).from(users).where(eq(users.id, friend));
    expect(u.by).toBe(referrer);
    expect((await rowFor(friend))?.status).toBe("joined");
  });

  it("refuses your own code", async () => {
    const id = await makeUser(PHONES[3]);
    expect(await attachReferral(id, await getOrCreateReferralCode(id))).toBe("self");
  });

  it("refuses a customer who already has a paid order", async () => {
    const referrer = await makeUser(PHONES[4]);
    const paid = await makePaidCustomer(PHONES[5]);
    expect(await attachReferral(paid, await getOrCreateReferralCode(referrer))).toBe("not_eligible");
    expect(await rowFor(paid)).toBeUndefined();
  });

  it("never moves an existing referral to someone else", async () => {
    const first = await makeUser(PHONES[6]);
    const second = await makeUser(PHONES[7]);
    const friend = await makeUser(PHONES[8]);
    expect(await attachReferral(friend, await getOrCreateReferralCode(first))).toBe("attached");
    expect(await attachReferral(friend, await getOrCreateReferralCode(second))).toBe("already");
    expect((await rowFor(friend))?.referrerUserId).toBe(first);
  });

  it("ignores a staff account's code", async () => {
    const staff = await makeUser(PHONES[9], "admin");
    const friend = await makeUser("+16475550038");
    expect(await attachReferral(friend, await getOrCreateReferralCode(staff))).toBe("unknown_code");
  });

  it("two sign-ins racing make one referral and neither fails", async () => {
    const phoneA = "+16475550036";
    const phoneB = "+16475550037";
    const referrer = await makeUser(phoneA);
    const friend = await makeUser(phoneB);
    const code = await getOrCreateReferralCode(referrer);
    const results = await Promise.all([attachReferral(friend, code), attachReferral(friend, code)]);
    expect(results.sort()).toEqual(["already", "attached"]);
    const rows = await db.select().from(referrals).where(eq(referrals.referredUserId, friend));
    expect(rows).toHaveLength(1);
  });
});

describe("attachReferral: not a new customer", () => {
  it("refuses a migrated (wc-) customer whose imported order has no settled payment", async () => {
    const referrer = await makeUser("+16475550033");
    const migrated = await makePaidCustomer("+16475550034");
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.userId, migrated));
    // Imported WP orders carry no settled payment; an unpaid one stands in for that here.
    await db.update(payments).set({ status: "awaiting_payment" }).where(eq(payments.orderId, o.id));
    await db.update(orders).set({ deploymentId: `wc-${Date.now()}` }).where(eq(orders.id, o.id));
    expect(await attachReferral(migrated, await getOrCreateReferralCode(referrer))).toBe("not_eligible");
  });

  it("refuses a customer whose only order was refunded", async () => {
    const referrer = await makeUser("+16475550035");
    const refunded = await makePaidCustomer("+16475550032");
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.userId, refunded));
    await db.update(payments).set({ status: "refunded" }).where(eq(payments.orderId, o.id));
    expect(await attachReferral(refunded, await getOrCreateReferralCode(referrer))).toBe("not_eligible");
  });

  it("refuses to refer back the person who referred you", async () => {
    const a = await makeUser("+16475550030");
    const b = await makeUser("+16475550031");
    expect(await attachReferral(b, await getOrCreateReferralCode(a))).toBe("attached");
    expect(await attachReferral(a, await getOrCreateReferralCode(b))).toBe("not_eligible");
  });
});

describe("verified sign-in only", () => {
  it("refuses an account whose email isn't verified yet", async () => {
    const referrer = await makeUser("+16475550026");
    const friend = await makeUser("+16475550027");
    await db.update(users).set({ emailVerified: false }).where(eq(users.id, friend));
    expect(await attachReferral(friend, await getOrCreateReferralCode(referrer))).toBe("not_eligible");
  });

  it("attachOnSignIn uses the share-link cookie first", async () => {
    const referrer = await makeUser("+16475550028");
    const friend = await makeUser("+16475550029");
    const code = await getOrCreateReferralCode(referrer);
    await attachOnSignIn(friend, new Headers({ cookie: `other=1; tg_ref=${code}` }));
    const [u] = await db.select({ by: users.referredByUserId }).from(users).where(eq(users.id, friend));
    expect(u.by).toBe(referrer);
  });

  it("attachOnSignIn falls back to the code typed at signup, then forgets it", async () => {
    const referrer = await makeUser("+16475550022");
    const friend = await makeUser("+16475550023");
    await db.update(users).set({ pendingReferralCode: await getOrCreateReferralCode(referrer) }).where(eq(users.id, friend));
    await attachOnSignIn(friend, new Headers());
    const [u] = await db.select({ by: users.referredByUserId, pending: users.pendingReferralCode }).from(users).where(eq(users.id, friend));
    expect(u).toEqual({ by: referrer, pending: null });
  });

  it("attachOnSignIn does nothing without a code", async () => {
    const friend = await makeUser("+16475550024");
    await attachOnSignIn(friend, null);
    expect(await rowFor(friend)).toBeUndefined();
  });
});
