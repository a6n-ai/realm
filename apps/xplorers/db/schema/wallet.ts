import { pgEnum } from "drizzle-orm/pg-core";
import { makeWalletTables } from "@foundry/wallet/schema";
import { users } from "./auth";
import { ledgerDirection } from "./payments";
import { bookings } from "./studio";

/** Events that can pay coins. Adding one = new value here + drizzle-kit generate. */
/** first_booking is the welcome bonus: once per family, on their first paid booking. */
export const APP_EVENTS = ["booking_paid", "first_booking", "birthday_booking", "manual_adjustment"] as const;
export type AppEvent = (typeof APP_EVENTS)[number];
export const appEvent = pgEnum("app_event", [...APP_EVENTS]);

// Bookings are xplorers' orders: wallet_ledger.order_id points at bookings.id.
export const { walletLedger, eventPayout, coinRate } = makeWalletTables({
  users,
  orders: bookings,
  appEvent,
  ledgerDirection,
});
