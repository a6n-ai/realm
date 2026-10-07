import { pgEnum } from "drizzle-orm/pg-core";
import { makeWalletTables } from "@foundry/wallet/schema";
import { users } from "./auth";
import { ledgerDirection } from "./payments";
import { bookings } from "./studio";

/**
 * Unified app-wide event catalog. Wallet payouts AND notification templates key
 * off this single enum (same pattern as tiffin-grab / puchkaman). An event need
 * not have a payout or a template — each subsystem uses the subset that applies.
 * first_booking is the welcome bonus: once per family, on their first paid booking.
 */
export const APP_EVENTS = [
  "booking_paid",
  "first_booking",
  "birthday_booking",
  "manual_adjustment",
  "wallet_credited",
  "ticket_created",
  "ticket_reply",
  "ticket_resolved",
  "friend_request",
  "friend_accepted",
  "staff_invitation",
] as const;
export type AppEvent = (typeof APP_EVENTS)[number];
export const appEvent = pgEnum("app_event", [...APP_EVENTS]);

// Bookings are xplorers' orders: wallet_ledger.order_id points at bookings.id.
export const { walletLedger, eventPayout, coinRate } = makeWalletTables({
  users,
  orders: bookings,
  appEvent,
  ledgerDirection,
});
