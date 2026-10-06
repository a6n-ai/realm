import { formatMoney } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import {
  commitRedemption,
  createWalletService,
  reserveRedemption,
  reverseAward,
  reverseRedemption,
  settleReservation,
  unexpired,
  type WalletDeps,
} from "@foundry/wallet";
import { ValidationError } from "@foundry/commons";
import { and, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  APP_EVENTS,
  bookings,
  coinRate,
  eventPayout,
  ledgerEntries,
  payments,
  studioSessions,
  users,
  walletLedger,
  type AppEvent,
} from "@/db/schema";
import { getAppClock, getMaxWalletBalance } from "./app-settings.service";

const log = createLogger("wallet");

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** How long coins stay held for a booking whose payment is still pending. */
export const COIN_HOLD_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Writes xplorers' own money-ledger row for coins spent on a booking. */
export const recordRedemptionDiscount: WalletDeps<AppEvent>["recordRedemptionDiscount"] = async (tx, args) => {
  const { currency } = await getAppClock();
  await tx.insert(ledgerEntries).values({
    userId: args.userId,
    bookingId: args.orderId,
    direction: "credit",
    type: "discount",
    amount: args.amount,
    currency,
    memo: args.memo,
  });
};

const base = createWalletService<AppEvent>({
  db,
  tables: { walletLedger, eventPayout, coinRate },
  orders: bookings,
  users,
  recordRedemptionDiscount,
  maxBalance: () => getMaxWalletBalance(),
});

/** Events staff can attach coins to (manual_adjustment is staff grants, not a payout). */
export const PAYOUT_EVENTS = APP_EVENTS.filter((e) => e !== "manual_adjustment");

/** One row per payout event so the admin grid always lists them; new rows start off. */
async function ensurePayoutRows(): Promise<void> {
  await db
    .insert(eventPayout)
    .values(PAYOUT_EVENTS.map((eventType) => ({ eventType, enabled: false, coins: 0 })))
    .onConflictDoNothing({ target: eventPayout.eventType });
}

/**
 * Coins for a booking whose payment was just verified — only bookings where
 * money actually changed hands earn coins (a $0 booking paid by coupon or
 * coins earns nothing). The first-booking (welcome) bonus is keyed per
 * family, so it pays once, on the family's first paid booking.
 * Each award is once-only per booking through the ledger's earn index, so a
 * retry or a second caller pays nothing extra. Never throws into the caller.
 */
async function awardBookingEvents(bookingId: bigint): Promise<void> {
  try {
    const [row] = await db
      .select({
        publicId: bookings.publicId,
        userId: bookings.userId,
        userPublicId: users.publicId,
        category: studioSessions.category,
      })
      .from(bookings)
      .innerJoin(studioSessions, eq(studioSessions.id, bookings.sessionId))
      .innerJoin(users, eq(users.id, bookings.userId))
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!row) return;
    const source = { type: "booking", id: row.publicId };
    await base.award(row.userId, "booking_paid", source);
    // Keyed per family, so the earn index pays it exactly once even when two
    // bookings are verified at the same moment.
    await base.award(row.userId, "first_booking", { type: "user", id: row.userPublicId });
    if (row.category === "birthday") await base.award(row.userId, "birthday_booking", source);
  } catch (err) {
    log.error({ err, bookingId: bookingId.toString() }, "booking coin award failed");
  }
}

/** Current coin value in the app currency, or null when no rate is set (wallet off). */
async function walletRate(): Promise<number | null> {
  const { currency } = await getAppClock();
  try {
    return await base.activeRate(currency);
  } catch {
    return null;
  }
}

async function heldCoins(userId: bigint): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${walletLedger.coins}), 0)::int` })
    .from(walletLedger)
    .where(and(eq(walletLedger.userId, userId), gt(walletLedger.reservedUntil, Date.now())));
  return row?.n ?? 0;
}

/** Internal id of a family (role user). Staff wallets are not adjustable from the console. */
async function familyUserId(publicId: string): Promise<bigint> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.publicId, publicId), eq(users.role, "user")))
    .limit(1);
  if (!row) throw new ValidationError("Customer not found.");
  return row.id;
}

/** Plain names for wallet events, shared by the family card and the admin screens. */
export const EVENT_LABELS: Record<AppEvent, string> = {
  booking_paid: "Booking paid",
  first_booking: "Welcome bonus (first booking)",
  birthday_booking: "Birthday booking",
  manual_adjustment: "From the team",
};

export type FamilyWallet = {
  balance: number;
  /** Coins set aside for bookings still waiting on payment. */
  held: number;
  value: string;
  recent: { publicId: string; when: number; coins: number; credit: boolean; label: string }[];
};

/** Balance (+ money value, + recent lines when asked) for a family, or null when the wallet is off. */
async function coinsForFamily(userPublicId: string, recent = 0): Promise<FamilyWallet | null> {
  const rate = await walletRate();
  if (rate === null) return null;
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId)).limit(1);
  if (!user) return null;
  const [balance, held, { currency }, rows] = await Promise.all([
    base.balance(user.id),
    heldCoins(user.id),
    getAppClock(),
    recent > 0 ? base.recentTransactions(user.id, recent) : Promise.resolve([]),
  ]);
  return {
    balance,
    held,
    value: formatMoney(balance * rate, currency),
    recent: rows.map((r) => ({
      publicId: r.publicId,
      when: r.createdAt,
      coins: r.coins,
      credit: r.direction === "credit",
      label: r.memo ?? (r.eventType ? EVENT_LABELS[r.eventType] : r.sourceType === "redemption" ? "Used on a booking" : "Wallet"),
    })),
  };
}

export const walletService = { ...base, ensurePayoutRows, awardBookingEvents, walletRate, coinsForFamily, familyUserId };

/**
 * Spendable balance under the family's row lock, so a second booking in
 * flight waits and then sees what this one took. Lock order (user first) is
 * the package's, so this never deadlocks against redemption code.
 */
export async function lockedBalance(tx: Tx, userId: bigint): Promise<number> {
  await tx.execute(sql`SELECT id FROM ${users} WHERE id = ${userId} FOR UPDATE`);
  const [row] = await tx
    .select({
      bal: sql<number>`coalesce(sum(case when ${walletLedger.direction} = 'credit' then ${walletLedger.coins} else -${walletLedger.coins} end), 0)::int`,
    })
    .from(walletLedger)
    .where(and(eq(walletLedger.userId, userId), unexpired(walletLedger, Date.now())));
  return row?.bal ?? 0;
}

/** Holds coins for a booking awaiting payment, or spends them now when nothing is due. */
export async function spendBookingCoins(
  tx: Tx,
  args: { userId: bigint; bookingId: bigint; coins: number; amount: number; hold: boolean },
): Promise<void> {
  const common = {
    userId: args.userId,
    coins: args.coins,
    currencyValue: args.amount,
    orderId: args.bookingId,
    memo: "Wallet coins",
    walletLedger,
    orders: bookings,
    users,
    recordRedemptionDiscount,
  };
  if (args.hold) await reserveRedemption(tx, { ...common, ttlMs: COIN_HOLD_TTL_MS });
  else await commitRedemption(tx, common);
}

/** Turns a booking's coin hold into a spend when its payment is verified. */
export function settleBookingCoins(tx: Tx, args: { userId: bigint; bookingId: bigint }) {
  return settleReservation(tx, { userId: args.userId, orderId: args.bookingId, walletLedger, orders: bookings, users });
}

/**
 * A booking's coin hold lapsed before its payment was verified, so the coins
 * went back to the wallet while the booking kept the coin-reduced price.
 * Take them again now (as many as the family still has) so lapsing a hold
 * can't be used to spend the same coins twice; the rest is reported for staff.
 */
export async function recollectLapsedCoins(
  tx: Tx,
  args: { userId: bigint; bookingId: bigint; bookingPublicId: string; coins: number },
): Promise<{ collected: number; notCollected: number }> {
  const balance = await lockedBalance(tx, args.userId);
  const collected = Math.max(0, Math.min(balance, args.coins));
  if (collected > 0) {
    await tx.insert(walletLedger).values({
      userId: args.userId,
      direction: "debit",
      sourceType: "redemption_late",
      sourceId: args.bookingPublicId,
      orderId: args.bookingId,
      coins: collected,
      memo: "Wallet coins (hold lapsed before payment)",
    });
  }
  return { collected, notCollected: args.coins - collected };
}

/**
 * Coins for a booking being cancelled. Coins it earned come back off the wallet
 * (the welcome bonus only if no other paid booking remains). If it was never
 * paid, coins held for it go straight back; a paid booking's spent coins stay
 * spent, since giving money back is a separate step.
 */
export async function takeBackBookingCoins(
  tx: Tx,
  args: { userId: bigint; userPublicId: string; bookingId: bigint; bookingPublicId: string; paid: boolean },
): Promise<void> {
  const booking = { type: "booking", id: args.bookingPublicId };
  for (const eventType of ["booking_paid", "birthday_booking"] as const) {
    await reverseAward(tx, { userId: args.userId, eventType, source: booking, walletLedger, users });
  }
  const [otherPaid] = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.userId, args.userId), eq(payments.status, "paid"), ne(payments.bookingId, args.bookingId)))
    .limit(1);
  if (!otherPaid) {
    await reverseAward(tx, {
      userId: args.userId,
      eventType: "first_booking",
      source: { type: "user", id: args.userPublicId },
      walletLedger,
      users,
    });
  }
  if (!args.paid) await reverseRedemption(tx, { userId: args.userId, orderId: args.bookingId, walletLedger, orders: bookings, users });
}
