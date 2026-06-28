import { baseColumns, updatableColumns } from "@tiffin/commons-drizzle";
import { bigint, boolean, index, integer, numeric, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { ledgerDirection } from "./coupons";
import { orders } from "./orders";
import { users } from "./auth";

// Curated catalog of main business events. Admin decides per event whether it
// pays coins (event_payout). Only events the app actually fires today.
export const businessEvent = pgEnum("business_event", [
  "order_created", "order_activated", "order_completed", "manual_adjustment",
  // deferred (no trigger yet): "referral_converted", "signup"
]);

export const walletLedger = pgTable("wallet_ledger", {
  ...baseColumns("wlt"),
  userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id),
  direction: ledgerDirection("direction").notNull(),
  eventType: businessEvent("event_type"),            // set on earn, null on spend
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
  eventType: businessEvent("event_type").notNull().unique(),
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
