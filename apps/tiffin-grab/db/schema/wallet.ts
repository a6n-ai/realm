import { makeWalletTables } from "@realm/wallet/schema";
import { pgEnum } from "drizzle-orm/pg-core";
import { ledgerDirection } from "./coupons";
import { orders } from "./orders";
import { users } from "./auth";

// Unified app-wide event catalog. Wallet payouts (event_payout) AND notification
// templates key off this single enum. An event need not have a payout or a
// template — each subsystem uses the subset that applies. It stays app-local:
// puchkaman has its own value set under the same Postgres type name, which is
// why the wallet tables come from a factory rather than being shared directly.
export const appEvent = pgEnum("app_event", [
  "order_created", "order_activated", "order_completed", "order_cancelled", "order_paused",
  "payment_received", "refund_issued",
  "menu_released",
  "wallet_credited", "wallet_redeemed",
  "inquiry_created", "inquiry_follow_up", "inquiry_converted",
  "ticket_created", "ticket_reply", "ticket_resolved",
  "signup", "manual_adjustment",
]);

export const { walletLedger, eventPayout, coinRate } = makeWalletTables({
  users,
  orders,
  appEvent,
  ledgerDirection,
});
