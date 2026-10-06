import { createLogger } from "@foundry/commons/logger";
import { createWalletService, type WalletDeps } from "@foundry/wallet";
import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import {
  APP_EVENTS,
  bookings,
  coinRate,
  eventPayout,
  ledgerEntries,
  studioSessions,
  users,
  walletLedger,
  type AppEvent,
} from "@/db/schema";
import { getAppClock, getMaxWalletBalance } from "./app-settings.service";

const log = createLogger("wallet");

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
 * Coins for a booking that just became paid (verified, or confirmed at $0).
 * Each award is once-only per booking through the ledger's earn index, so a
 * retry or a second caller pays nothing extra. Never throws into the caller.
 */
async function awardBookingEvents(bookingId: bigint): Promise<void> {
  try {
    const [row] = await db
      .select({ publicId: bookings.publicId, userId: bookings.userId, category: studioSessions.category })
      .from(bookings)
      .innerJoin(studioSessions, eq(studioSessions.id, bookings.sessionId))
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!row) return;
    const source = { type: "booking", id: row.publicId };
    await base.award(row.userId, "booking_paid", source);
    const [earlier] = await db
      .select({ n: count() })
      .from(bookings)
      .where(and(eq(bookings.userId, row.userId), eq(bookings.status, "confirmed"), ne(bookings.id, bookingId)));
    if (Number(earlier?.n ?? 0) === 0) await base.award(row.userId, "first_booking", source);
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

export const walletService = { ...base, ensurePayoutRows, awardBookingEvents, walletRate };
