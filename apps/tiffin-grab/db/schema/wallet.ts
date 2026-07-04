import { baseColumns, updatableColumns } from "@realm/commons-drizzle";
import { bigint, boolean, index, integer, numeric, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { ledgerDirection } from "./coupons";
import { orders } from "./orders";
import { users } from "./auth";

// Unified app-wide event catalog. Wallet payouts (event_payout) AND notification
// templates key off this single enum. An event need not have a payout or a
// template — each subsystem uses the subset that applies.
export const appEvent = pgEnum("app_event", [
  "order_created", "order_activated", "order_completed", "order_cancelled", "order_paused",
  "payment_received", "refund_issued",
  "menu_released",
  "wallet_credited", "wallet_redeemed",
  "inquiry_created", "inquiry_follow_up", "inquiry_converted",
  "ticket_created", "ticket_reply", "ticket_resolved",
  "signup", "manual_adjustment",
]);

export const walletLedger = pgTable("wallet_ledger", {
  ...baseColumns("wlt"),
  userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id),
  direction: ledgerDirection("direction").notNull(),
  eventType: appEvent("event_type"),                 // set on earn, null on spend
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  coins: integer("coins").notNull(),                  // always positive; direction gives sign
  memo: text("memo"),
  orderId: bigint("order_id", { mode: "bigint" }).references(() => orders.id),
}, (t) => [
  index("wallet_user_created_idx").on(t.userId, t.createdAt),
  uniqueIndex("wallet_earn_idempotent_idx").on(t.sourceType, t.sourceId, t.eventType),
]);

export const eventPayout = pgTable("event_payout", {
  ...updatableColumns("evp"),
  eventType: appEvent("event_type").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  coins: integer("coins").notNull().default(0),
});

export const coinRate = pgTable("coin_rate", {
  ...baseColumns("cnr"),
  currency: text("currency").notNull(),
  valuePerCoin: numeric("value_per_coin", { precision: 10, scale: 4 }).notNull(),
}, (t) => [
  index("coin_rate_currency_created_idx").on(t.currency, t.createdAt),
]);
