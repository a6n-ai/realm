import { baseColumns, updatableColumns } from "@realm/database";
import {
  bigint,
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  type AnyPgTable,
  type PgEnum,
} from "drizzle-orm/pg-core";

/**
 * Build the wallet tables against one app's `users`/`orders` tables and its
 * `app_event`/`ledger_direction` enums.
 *
 * The tables cannot be shared as values: they FK to `users.id`/`orders.id` and
 * use per-app enums (tiffin-grab's `app_event` has 18 subscription events,
 * puchkaman's has 9 pickup/delivery ones — same Postgres type name, different
 * value sets). Each app calls this from its own schema barrel and re-exports,
 * so drizzle-kit generates that app's migration — the same approach
 * `makeNotificationTables` uses.
 */
export function makeWalletTables<
  E extends [string, ...string[]],
  D extends [string, ...string[]],
>(deps: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  users: AnyPgTable & { id: any };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orders: AnyPgTable & { id: any };
  appEvent: PgEnum<E>;
  ledgerDirection: PgEnum<D>;
}) {
  const { users, orders, appEvent, ledgerDirection } = deps;
  const userId = () => users.id;
  const orderId = () => orders.id;

  const walletLedger = pgTable("wallet_ledger", {
    ...baseColumns("wlt"),
    userId: bigint("user_id", { mode: "bigint" }).notNull().references(userId),
    direction: ledgerDirection("direction").notNull(),
    eventType: appEvent("event_type"),                 // set on earn, null on spend
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    coins: integer("coins").notNull(),                  // always positive; direction gives sign
    memo: text("memo"),
    orderId: bigint("order_id", { mode: "bigint" }).references(orderId),
  }, (t) => [
    index("wallet_user_created_idx").on(t.userId, t.createdAt),
    uniqueIndex("wallet_earn_idempotent_idx").on(t.sourceType, t.sourceId, t.eventType),
  ]);

  const eventPayout = pgTable("event_payout", {
    ...updatableColumns("evp"),
    eventType: appEvent("event_type").notNull().unique(),
    enabled: boolean("enabled").notNull().default(false),
    coins: integer("coins").notNull().default(0),
  });

  const coinRate = pgTable("coin_rate", {
    ...baseColumns("cnr"),
    currency: text("currency").notNull(),
    valuePerCoin: numeric("value_per_coin", { precision: 10, scale: 4 }).notNull(),
  }, (t) => [
    index("coin_rate_currency_created_idx").on(t.currency, t.createdAt),
  ]);

  return { walletLedger, eventPayout, coinRate };
}

export type WalletTables = ReturnType<typeof makeWalletTables>;
