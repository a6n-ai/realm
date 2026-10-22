import { randomInt } from "node:crypto";
import { and, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { account, orderActivities, orders, payments, referrals, users, walletLedger } from "@/db/schema";
import type { OrderPricingSnapshot } from "@/lib/pricing";
import { referralCoins } from "@/lib/referrals/reward";
import { coinsUnderCap } from "@/lib/wallet/earn-coins";
import { earnsOrderCoins } from "@/lib/wallet/earns-coins";
import { getAppSettings, getMaxWalletBalance, getReferralSettings, type ReferralSettings } from "./app-settings.service";
import { balanceInTx, reverseCoinAward, walletService, type AwardableOrder } from "./wallet.service";
import { normalizeReferralCode, readReferralCookie } from "@/lib/referrals/cookie";

// No 0/O, 1/I/L: codes get read out loud and typed from screenshots.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// 31^6 ≈ 887M codes; the unique index + retry below catch the rare clash.
const CODE_LENGTH = 6;
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

/** Not new: ever paid (a refund doesn't make them new again), or a migrated
 * WordPress customer — their imported wc- orders carry no payment row. */
async function hasOrderHistory(q: Tx | typeof db, userId: bigint): Promise<boolean> {
  const [row] = await q
    .select({ id: orders.id })
    .from(orders)
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .where(and(
      eq(orders.userId, userId),
      or(inArray(payments.status, [...PAID, "refunded"]), ilike(orders.deploymentId, "wc-%")),
    ))
    .limit(1);
  return row != null;
}

export type AttachResult = "attached" | "unknown_code" | "self" | "not_eligible" | "already";

/**
 * Sign-in hook body. Only the browser's own cookie (share link or signup form)
 * counts: nothing stored on the account, so a code planted on a pre-registered
 * email can't ride along when the real owner later verifies.
 */
export async function attachOnSignIn(userId: bigint, headers: Headers | null | undefined): Promise<AttachResult | null> {
  const code = readReferralCookie(headers);
  return code ? attachReferral(userId, code) : null;
}

/** Links a signing-in customer to the referrer behind `rawCode`. Set once, never moved. */
export async function attachReferral(userId: bigint, rawCode: string): Promise<AttachResult> {
  const referrer = await findReferrerByCode(rawCode);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM ${users} WHERE id = ${userId} FOR UPDATE`);
    const [me] = await tx.select({ role: users.role, referredBy: users.referredByUserId, verified: users.emailVerified }).from(users).where(eq(users.id, userId)).limit(1);
    if (!me) return "not_eligible";
    if (me.referredBy != null) return "already";
    // Only an account its owner has signed in to: a pre-registered, never-verified
    // email can't be claimed for someone's code before the real person shows up.
    if (me.role !== "user" || !me.verified) return "not_eligible";
    if (!referrer) return "unknown_code";
    if (referrer.id === userId) return "self";

    if (await hasOrderHistory(tx, userId)) return "not_eligible";
    // No referring back the person who referred you: a 2-cycle pays both twice.
    const [back] = await tx.select({ by: users.referredByUserId }).from(users).where(eq(users.id, referrer.id)).limit(1);
    if (back?.by === userId) return "not_eligible";

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

/** "Priya Sharma" → "Priya S." — friends list shows no full names. */
function shortName(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A friend";
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

export type ReferralFriendStatus = "joined" | "ordered" | "rewarded" | "reversed";
export type ReferralSummary = {
  code: string;
  settings: ReferralSettings;
  totalCoins: number;
  friends: { name: string; status: ReferralFriendStatus; joinedAt: number }[];
  /** Google sign-ups never saw the subscribe-step code field: offer it on the Refer tab. */
  canEnterCode?: boolean;
};

/** Everything the customer Refer tab shows. */
export async function getReferralSummary(userId: bigint): Promise<ReferralSummary> {
  const [code, settings, rows, [me], [google], history] = await Promise.all([
    getOrCreateReferralCode(userId),
    getReferralSettings(),
    db
      .select({ name: users.name, status: referrals.status, referrerCoins: referrals.referrerCoins, joinedAt: referrals.createdAt })
      .from(referrals)
      .innerJoin(users, eq(users.id, referrals.referredUserId))
      .where(eq(referrals.referrerUserId, userId))
      .orderBy(desc(referrals.createdAt)),
    db.select({ by: users.referredByUserId }).from(users).where(eq(users.id, userId)).limit(1),
    db.select({ id: account.id }).from(account).where(and(eq(account.userId, userId), eq(account.providerId, "google"))).limit(1),
    hasOrderHistory(db, userId),
  ]);
  return {
    code,
    settings,
    totalCoins: rows.filter((r) => r.status !== "reversed").reduce((n, r) => n + r.referrerCoins, 0),
    friends: rows.map((r) => ({ name: shortName(r.name), status: r.status, joinedAt: Number(r.joinedAt) })),
    canEnterCode: google != null && me?.by == null && !history,
  };
}

export type ReferralListRow = {
  publicId: string;
  referrer: { publicId: string; name: string | null; email: string };
  friend: { publicId: string; name: string | null; email: string };
  status: ReferralFriendStatus;
  referrerCoins: number;
  friendCoins: number;
  skipReason: string | null;
  orderPublicId: string | null;
  createdAt: number;
};

const referrerUser = alias(users, "referrer");
const friendUser = alias(users, "friend");

/** Admin Wallet → Referrals. Newest first. */
export async function listReferrals(opts: { status?: ReferralFriendStatus; search?: string; page: number; pageSize: number }): Promise<{ rows: ReferralListRow[]; total: number }> {
  const q = opts.search?.trim();
  const like = `%${q}%`;
  const where = and(
    opts.status ? eq(referrals.status, opts.status) : undefined,
    q
      ? or(
          ilike(referrerUser.name, like), ilike(referrerUser.email, like), ilike(referrerUser.phone, like),
          ilike(friendUser.name, like), ilike(friendUser.email, like), ilike(friendUser.phone, like),
        )
      : undefined,
  );
  const base = () =>
    db
      .select({
        publicId: referrals.publicId,
        rPublicId: referrerUser.publicId, rName: referrerUser.name, rEmail: referrerUser.email,
        fPublicId: friendUser.publicId, fName: friendUser.name, fEmail: friendUser.email,
        status: referrals.status,
        referrerCoins: referrals.referrerCoins,
        friendCoins: referrals.friendCoins,
        skipReason: referrals.skipReason,
        orderPublicId: orders.publicId,
        createdAt: referrals.createdAt,
      })
      .from(referrals)
      .innerJoin(referrerUser, eq(referrerUser.id, referrals.referrerUserId))
      .innerJoin(friendUser, eq(friendUser.id, referrals.referredUserId))
      .leftJoin(orders, eq(orders.id, referrals.qualifyingOrderId))
      .where(where);
  const [rows, [{ total }]] = await Promise.all([
    base().orderBy(desc(referrals.createdAt), desc(referrals.id)).limit(opts.pageSize).offset(opts.page * opts.pageSize),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(referrals)
      .innerJoin(referrerUser, eq(referrerUser.id, referrals.referrerUserId))
      .innerJoin(friendUser, eq(friendUser.id, referrals.referredUserId))
      .where(where),
  ]);
  return {
    total,
    rows: rows.map((r) => ({
      publicId: r.publicId,
      referrer: { publicId: r.rPublicId, name: r.rName, email: r.rEmail },
      friend: { publicId: r.fPublicId, name: r.fName, email: r.fEmail },
      status: r.status,
      referrerCoins: r.referrerCoins,
      friendCoins: r.friendCoins,
      skipReason: r.skipReason,
      orderPublicId: r.orderPublicId,
      createdAt: Number(r.createdAt),
    })),
  };
}

/** Customer detail: who referred them, and how many they referred. */
export async function getReferralInfo(userId: bigint): Promise<{ referredBy: { publicId: string; name: string | null } | null; referredCount: number }> {
  const [[by], [{ n }]] = await Promise.all([
    db
      .select({ publicId: referrerUser.publicId, name: referrerUser.name })
      .from(users)
      .innerJoin(referrerUser, eq(referrerUser.id, users.referredByUserId))
      .where(eq(users.id, userId))
      .limit(1),
    db.select({ n: sql<number>`count(*)::int` }).from(referrals).where(eq(referrals.referrerUserId, userId)),
  ]);
  return { referredBy: by ?? null, referredCount: n };
}

/** Discounts → Referrals stat cards. Taken-back referrals count, but their coins don't. */
export async function referralStats(): Promise<{ total: number; rewarded: number; waiting: number; referrerCoins: number; friendCoins: number }> {
  const live = sql`${referrals.status} <> 'reversed'`;
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      rewarded: sql<number>`(count(*) filter (where ${referrals.status} = 'rewarded'))::int`,
      waiting: sql<number>`(count(*) filter (where ${referrals.status} = 'joined'))::int`,
      referrerCoins: sql<number>`coalesce(sum(${referrals.referrerCoins}) filter (where ${live}), 0)::int`,
      friendCoins: sql<number>`coalesce(sum(${referrals.friendCoins}) filter (where ${live}), 0)::int`,
    })
    .from(referrals);
  return row;
}
