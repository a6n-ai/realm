import { randomInt } from "node:crypto";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { orderActivities, orders, payments, referrals, users, walletLedger } from "@/db/schema";
import type { OrderPricingSnapshot } from "@/lib/pricing";
import { referralCoins } from "@/lib/referrals/reward";
import { coinsUnderCap } from "@/lib/wallet/earn-coins";
import { earnsOrderCoins } from "@/lib/wallet/earns-coins";
import { getAppSettings, getMaxWalletBalance, getReferralSettings } from "./app-settings.service";
import { balanceInTx, reverseCoinAward, walletService, type AwardableOrder } from "./wallet.service";
import { normalizeReferralCode } from "@/lib/referrals/cookie";

// No 0/O, 1/I/L: codes get read out loud and typed from screenshots.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const PAID = ["paid", "simulated_paid"] as const;

export { normalizeReferralCode };

function newCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

/** The customer's share code, made the first time it's needed. */
export async function getOrCreateReferralCode(userId: bigint): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [row] = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId)).limit(1);
    if (row?.code) return row.code;
    try {
      await db.update(users).set({ referralCode: newCode() }).where(and(eq(users.id, userId), isNull(users.referralCode)));
    } catch (e) {
      // Unique clash with another customer's code: roll again.
      if ((e as { cause?: { code?: string } }).cause?.code !== "23505" && (e as { code?: string }).code !== "23505") throw e;
    }
  }
  throw new Error("Could not make a referral code");
}

/** Only an active customer account can refer; staff codes don't exist for this. */
export async function findReferrerByCode(raw: string): Promise<{ id: bigint; publicId: string } | null> {
  const code = normalizeReferralCode(raw);
  if (!code) return null;
  const [row] = await db
    .select({ id: users.id, publicId: users.publicId })
    .from(users)
    .where(and(eq(users.referralCode, code), eq(users.role, "user"), eq(users.status, "active")))
    .limit(1);
  return row ?? null;
}

export type AttachResult = "attached" | "unknown_code" | "self" | "not_eligible" | "already";

/** Links a signing-in customer to the referrer behind `rawCode`. Set once, never moved. */
export async function attachReferral(userId: bigint, rawCode: string): Promise<AttachResult> {
  const referrer = await findReferrerByCode(rawCode);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM ${users} WHERE id = ${userId} FOR UPDATE`);
    const [me] = await tx.select({ role: users.role, referredBy: users.referredByUserId }).from(users).where(eq(users.id, userId)).limit(1);
    if (!me) return "not_eligible";
    if (me.referredBy != null) return "already";
    if (me.role !== "user") return "not_eligible";
    if (!referrer) return "unknown_code";
    if (referrer.id === userId) return "self";

    const [paid] = await tx
      .select({ id: orders.id })
      .from(orders)
      .innerJoin(payments, eq(payments.orderId, orders.id))
      .where(and(eq(orders.userId, userId), inArray(payments.status, [...PAID])))
      .limit(1);
    if (paid) return "not_eligible";

    await tx.update(users).set({ referredByUserId: referrer.id }).where(eq(users.id, userId));
    await tx.insert(referrals).values({ referrerUserId: referrer.id, referredUserId: userId }).onConflictDoNothing({ target: referrals.referredUserId });
    return "attached";
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Side = "referral_friend" | "referral_referrer";

const firstName = (name: string | null) => (name ?? "").trim().split(/\s+/)[0] || "a customer";

/**
 * Referral coins on the friend's first paid order, inside the caller's payment/
 * activation transaction. Runs before awardOrderCoins so both users are locked
 * in id order first (two referral awards can't deadlock). Never throws for a
 * business reason: a skipped side is recorded on the referral row and the order.
 */
export async function awardReferral(
  tx: Tx,
  order: AwardableOrder,
  paymentStatus: string | null,
): Promise<{ friend: number; referrer: number; skipped?: string }> {
  const none = { friend: 0, referrer: 0 };
  if (order.userId == null || !earnsOrderCoins({ total: order.total, paymentStatus })) return none;
  const [ref] = await tx.select().from(referrals).where(eq(referrals.referredUserId, order.userId)).limit(1);
  if (!ref || ref.status !== "joined") return none;

  const pair = [ref.referrerUserId, ref.referredUserId].sort((a, b) => (a < b ? -1 : 1));
  await tx.execute(sql`SELECT id FROM ${users} WHERE id IN (${pair[0]}, ${pair[1]}) ORDER BY id FOR UPDATE`);
  // Re-read under the lock: a concurrent verify/activate may have taken it.
  const [locked] = await tx.select().from(referrals).where(eq(referrals.id, ref.id)).for("update").limit(1);
  if (locked.status !== "joined") return none;

  const people = await tx
    .select({ id: users.id, name: users.name, status: users.status })
    .from(users)
    .where(inArray(users.id, pair));
  const friendUser = people.find((p) => p.id === ref.referredUserId)!;
  const referrerUser = people.find((p) => p.id === ref.referrerUserId)!;
  const note = (text: string) => tx.insert(orderActivities).values({ orderId: order.id, type: "note", note: text });
  const finish = async (friendCoins: number, referrerCoins: number, skipReason: string | null) => {
    await tx.update(referrals).set({
      status: friendCoins > 0 || referrerCoins > 0 ? "rewarded" : "ordered",
      qualifyingOrderId: order.id,
      friendCoins,
      referrerCoins,
      skipReason,
    }).where(eq(referrals.id, ref.id));
    const who = `${firstName(friendUser.name)} referred by ${firstName(referrerUser.name)}`;
    await note(`Referral: ${who} — friend +${friendCoins}, referrer +${referrerCoins} coins${skipReason ? ` (${skipReason})` : ""}`);
    return { friend: friendCoins, referrer: referrerCoins, ...(skipReason ? { skipped: skipReason } : {}) };
  };

  const s = await getReferralSettings();
  if (s.referrerValue <= 0 && s.friendValue <= 0) return finish(0, 0, "off");

  let rate: number | null = null;
  if (s.mode === "pct") {
    const { currency } = await getAppSettings();
    try {
      rate = await walletService.activeRate(currency);
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e;
      return finish(0, 0, "no_rate");
    }
  }
  const taxTotal = (order.pricingSnapshot as OrderPricingSnapshot).taxTotal ?? 0;
  const amount = (value: number) => referralCoins({ mode: s.mode, value, total: Number(order.total), taxTotal, valuePerCoin: rate });
  const walletCap = await getMaxWalletBalance();
  const credit = async (userId: bigint, coins: number, eventType: Side, memo: string): Promise<number> => {
    if (coins <= 0) return 0;
    if (coinsUnderCap({ coins, balance: await balanceInTx(tx, userId), cap: walletCap }) === 0) return 0;
    const res = await tx
      .insert(walletLedger)
      .values({ userId, direction: "credit", eventType, sourceType: "referral", sourceId: ref.publicId, coins, memo })
      .onConflictDoNothing({ target: [walletLedger.sourceType, walletLedger.sourceId, walletLedger.eventType] })
      .returning({ id: walletLedger.id });
    return res.length > 0 ? coins : 0;
  };

  let skip: string | null = null;
  const friendWant = amount(s.friendValue);
  const friendCoins = await credit(ref.referredUserId, friendWant, "referral_friend", `Welcome reward from ${firstName(referrerUser.name)}'s referral`);
  if (friendWant > 0 && friendCoins === 0) skip = "wallet_cap";

  let referrerCoins = 0;
  const referrerWant = amount(s.referrerValue);
  if (referrerWant <= 0) skip ??= "off";
  else if (referrerUser.status !== "active") skip = "referrer_inactive";
  else if (s.maxPerReferrer != null && (await rewardedCount(tx, ref.referrerUserId)) >= s.maxPerReferrer) skip = "cap";
  else {
    referrerCoins = await credit(ref.referrerUserId, referrerWant, "referral_referrer", `Referral reward: ${firstName(friendUser.name)} joined`);
    if (referrerCoins === 0) skip = "wallet_cap";
  }
  return finish(friendCoins, referrerCoins, skip);
}

/** Referrals that used a referrer's cap slot: referrer was paid and it wasn't taken back. */
async function rewardedCount(tx: Tx, referrerUserId: bigint): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(referrals)
    .where(and(eq(referrals.referrerUserId, referrerUserId), sql`${referrals.referrerCoins} > 0`, ne(referrals.status, "reversed")));
  return row?.n ?? 0;
}

/** On refund/cancel of a referral's qualifying order: take both rewards back. */
export async function reverseReferral(tx: Tx, order: { id: bigint }): Promise<void> {
  const [ref] = await tx.select().from(referrals).where(eq(referrals.qualifyingOrderId, order.id)).for("update").limit(1);
  if (!ref || ref.status === "reversed") return;
  const source = { type: "referral", id: ref.publicId };
  await reverseCoinAward(tx, { userId: ref.referredUserId, eventType: "referral_friend", source });
  await reverseCoinAward(tx, { userId: ref.referrerUserId, eventType: "referral_referrer", source });
  await tx.update(referrals).set({ status: "reversed" }).where(eq(referrals.id, ref.id));
}
