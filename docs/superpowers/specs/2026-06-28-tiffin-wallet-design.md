# Tiffin Wallet — Design

**Date:** 2026-06-28
**Status:** Draft (approved for spec)
**Related:** `2026-06-28-audit-log-design.md` (shares the `business_event` enum), `2026-06-27-discount-coupons-settings-design.md` (existing discount/ledger machinery)

## Problem

Reward customers with **coins** when they complete meaningful actions. Admin controls which events earn coins and how many, and the coin → currency value (per currency/region). Customers spend coins as a discount at checkout. Must be auditable and idempotent (never double-pay an event).

## Core idea: one event catalog, admin-configured payout

There is **no separate hardcoded "earn events" list.** The app has one curated catalog of main business events (`business_event` enum). Admin sees that catalog in settings and decides, per event, whether it pays coins and how many (`event_payout` table). Disabled / 0 coins = no payout. This is the unifying model with the audit log.

## What already exists (reuse, do not fork)

- **`ledgerEntries`** (`coupons.ts`, prefix `led`) — append-only debit/credit ledger with `direction`/`type`/`amount`/`memo`, indexed `(userId, createdAt)`. The wallet mirrors this shape.
- **`ledgerDirection`** enum (`debit | credit`) — reuse, do not redefine.
- **Order discount path** — order ledger `discount` entries already reduce order totals (coupon system). Coin redemption rides this path.
- **`baseColumns`/`updatableColumns`** — id/publicId/createdAt/createdBy(/updatedAt/updatedBy), epoch-ms bigint timestamps.
- **Admin typed controls** convention — settings editors use select/number/toggle, never free-text for enums/numbers.

## `business_event` enum (the catalog)

Seeded from events the app actually fires today:

```
order_created | order_activated | order_completed | manual_adjustment
```

- `referral_converted` is **deferred** — no referral/`referredBy` link exists in schema yet (only lead-tracing, see `2026-06-25-lead-traced-order-customer-creation-design.md`). Add to the enum when a referral attribution link lands.
- `signup` is **deferred** — confirm a clean signup trigger exists before adding; not required for v1.
- `manual_adjustment` is the always-available escape hatch (admin grants by hand).

> **ponytail / YAGNI:** the enum lists only events that exist. No `review_posted`, `rating_given`, etc. — those features don't exist. Grow the enum when the event becomes real.

## Schema (new — `apps/web/db/schema/wallet.ts`)

```ts
export const walletLedger = pgTable("wallet_ledger", {
  ...baseColumns("wlt"),
  userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id),
  direction: ledgerDirection("direction").notNull(),      // reuse existing enum
  eventType: businessEvent("event_type"),                  // set on earn, null on spend
  sourceType: text("source_type").notNull(),               // e.g. "order", "manual", "redemption"
  sourceId: text("source_id").notNull(),                   // public id of the source
  coins: integer("coins").notNull(),                       // whole coins, always positive; direction gives sign
  memo: text("memo"),
  orderId: bigint("order_id", { mode: "bigint" }).references(() => orders.id), // set on spend
}, (t) => [
  index("wallet_user_created_idx").on(t.userId, t.createdAt),
  uniqueIndex("wallet_earn_idempotent_idx").on(t.sourceType, t.sourceId, t.eventType), // earns can't double-fire
]);

export const eventPayout = pgTable("event_payout", {
  ...updatableColumns("evp"),
  eventType: businessEvent("event_type").notNull().unique(), // one row per event
  enabled: boolean("enabled").notNull().default(false),
  coins: integer("coins").notNull().default(0),
});

export const coinRate = pgTable("coin_rate", {
  ...baseColumns("cnr"),
  currency: text("currency").notNull(),                       // "CAD", ...
  valuePerCoin: numeric("value_per_coin", { precision: 10, scale: 4 }).notNull(), // 1 coin = X currency
}, (t) => [
  index("coin_rate_currency_created_idx").on(t.currency, t.createdAt), // active = latest per currency
]);
```

Notes:
- **Coins are integers** (not numeric) — they're a count, not money. Currency value is derived via `coin_rate`.
- `coin_rate` is **versioned by `createdAt`** (append-only); the active rate per currency = latest row. Old rates stay for auditing past redemptions.
- `event_payout` is mutable config (`updatableColumns`) so admin edits are themselves audit-stamped.
- The earn idempotency unique index treats `eventType` as part of the key; spend rows (`eventType = null`) are excluded from that uniqueness in Postgres (nulls distinct) — redemption idempotency is enforced separately by `(sourceType="redemption", sourceId)` at the service layer.

## Service: `WalletService`

```
balance(userId): number
  → SUM(coins WHERE credit) − SUM(coins WHERE debit) for user.

award(userId, eventType, source: {type, id}, memo?)
  → look up event_payout[eventType]; if !enabled || coins<=0 → no-op.
  → insert credit row (coins, eventType, sourceType, sourceId).
  → unique index makes a repeat call a safe no-op (catch conflict).

redeem(userId, coins, orderId): {coinsSpent, currencyValue}
  → validate coins <= balance(userId) and coins > 0.
  → currencyValue = coins * activeRate(orderCurrency).
  → cap currencyValue at order total; recompute coinsSpent if capped.
  → insert debit row (sourceType:"redemption", sourceId:orderId, orderId).
  → insert order ledger 'discount' entry for currencyValue (existing path).
  → both inserts in one transaction.

activeRate(currency): number  → latest coin_rate row for currency.
```

## Flows

**Earn** — wherever a business event fires (e.g. order activation handler), call `WalletService.award(userId, "order_activated", {type:"order", id:orderPublicId})`. Idempotent: the unique index prevents a second credit for the same `(order, order_activated)`.

**Spend (checkout)** — customer chooses coins to apply → `redeem(...)` converts at the active rate, caps at order total, writes debit + order discount entry atomically.

**Admin config** — settings page:
- `event_payout` grid: one row per `business_event`, toggle `enabled` + number `coins` (typed controls).
- `coin_rate` editor: per currency, set `valuePerCoin` (writes a new versioned row).

## Balance integrity

Append-only ledger → balance always derivable, no mutable column to corrupt, concurrent payouts are independent inserts. No cached balance column in v1.

> **ponytail:** `SUM` per balance read is fine at CRM scale. Add a cached/materialized balance only if a profile shows it's hot.

## Error handling

- `redeem` with coins > balance → reject (ValidationError), no rows written.
- Capping: never grant more discount than the order total; coinsSpent reflects the cap.
- `award` for a disabled/zero event → silent no-op.
- Duplicate `award` → conflict caught, no-op (idempotent).
- Negative/zero amounts rejected at the service boundary.

## Testing (live-DB harness)

- `award` credits correct coins from `event_payout`; disabled event → no row; duplicate `award` → still one row; balance reflects it.
- `redeem` writes debit + order discount, caps at order total, rejects over-balance, is idempotent per order.
- `activeRate` returns the latest row per currency.
- Balance = credits − debits across a mixed sequence.

## Out of scope

- Coin expiry / decay.
- Coin transfer between users.
- Customer-facing wallet history UI (separate spec; data is all in `wallet_ledger`).
- `referral_converted` / `signup` payouts (blocked on missing triggers — see enum notes).
- Multi-currency rate auto-conversion (admin sets each currency's rate manually).

## Open items

- Confirm order activation call site for the `award` hook.
- Confirm checkout UI affordance for choosing coins to redeem (slider/number, max = balance).
- Decide default `coin_rate` for CAD at launch.
