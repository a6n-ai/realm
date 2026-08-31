import { baseColumns, updatableColumns } from "@foundry/database";
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
    /**
     * Reservation deadline (epoch ms) for an UNCOMMITTED debit — a hold taken
     * at quote time so the same coins cannot fund a second order while this
     * one waits to be paid.
     *
     *   null            → a committed row. Every credit, and every debit
     *                     written by `commitRedemption`, is this.
     *   > now()         → a live hold: counts against the balance, but is not
     *                     yet spent. `settleReservation` commits it by
     *                     nulling this column.
     *   <= now()        → expired: ignored by every balance/history read, so
     *                     the coins are spendable again with no sweep, no
     *                     reversal row and no mirroring ledger adjustment.
     *
     * Expiry is the release mechanism ON PURPOSE — that is the whole point of
     * the column. Anything that needs an early release (a terminal-failure
     * path) just moves this to now(); it never writes a credit.
     */
    reservedUntil: bigint("reserved_until", { mode: "number" }),
  }, (t) => [
    index("wallet_user_created_idx").on(t.userId, t.createdAt),
    index("wallet_reserved_until_idx").on(t.reservedUntil),
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

/**
 * Parameterised on the app's actual event union so consumers who inject
 * their real tables get their real event enum back — not `string`. `[E,
 * ...E[]]` feeds `makeWalletTables`'s tuple-constrained generic without
 * duplicating the table shape; `PgEnum<[E,...E[]]>` collapses its `data`
 * type back down to the plain union `E`.
 *
 * Direction is pinned to `"credit" | "debit"` (not a second type param): both
 * real ledger_direction enums use exactly these two values, and leaving it
 * fully generic breaks drizzle's insert/select overload resolution outright
 * (its column-type inference can't collapse an abstract type param through
 * the `Column extends ... ? T : ...` machinery it uses internally — this
 * isn't just a literal-mismatch warning, the whole overload disappears).
 * `["credit","debit"] | ["debit","credit"]` — rather than one fixed order —
 * because drizzle's `PgEnumColumn['enumValues']` is the exact declared tuple
 * compared positionally, and tiffin-grab's is `["debit", "credit"]`; a
 * consumer who lists the two values in either order still matches one member
 * of the union, while a genuinely different spelling (not "credit"/"debit")
 * still fails to typecheck.
 */
export type WalletTables<E extends string = string> = ReturnType<
  typeof makeWalletTables<[E, ...E[]], ["credit", "debit"] | ["debit", "credit"]>
>;
