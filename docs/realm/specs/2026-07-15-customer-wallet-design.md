# Customer Wallet — Design (Slice 3)

**Date:** 2026-07-15
**App:** `apps/tiffin-grab`
**Status:** Approved, ready for implementation plan
**Program:** Customer-experience revamp, Slice 3 of 6. Consumes Slice-0 motion (`AnimatedNumber`, `Lottie`/coin-burst) + the list framework.

## Goal

Turn the customer wallet from a home peek into a real wallet at **`/me/wallet`**: a coin balance + money-value hero, earn/spend totals, and the full **filterable + paginated coins log**. The home `WalletSection` becomes a compact peek linking to it.

## Ground truth (codebase map, 2026-07-15)

- **Coins ≠ money — two ledgers.** `wallet_ledger` = **coins** (`db/schema/wallet.ts`): `userId`, `direction` (`ledgerDirection` enum — credit/debit), `eventType` (`app_event` enum, **nullable** — set on earn, null on spend), `sourceType`/`sourceId`, `coins` (integer, always positive; sign from `direction`), `memo`, `orderId` (nullable FK). Index `(userId, createdAt)`; earn-idempotency unique `(sourceType, sourceId, eventType)`. The **money** ledger is a *different* table (`ledgerEntries`, via `ledger.service` `totalSpent`/`totalSavings`) feeding analytics — not the wallet.
- **`walletService`** (`lib/services/wallet.service.ts`) exposes exactly: `balance(userId): number` (one net signed sum), `recentTransactions(userId, limit=10): WalletTx[]` (**no pagination/cursor**), `award`, `redeem`, `activeRate(currency): number`. **No full/paginated ledger read and no earn-vs-spend totals exist** — both are net-new (small queries).
- `WalletTx` = `{ publicId; direction: "credit"|"debit"; coins; eventType: BusinessEvent|null; sourceType; sourceId; memo; createdAt: number; orderPublicId: string|null }`.
- **Money value:** `activeRate(currency)` = latest `coin_rate.valuePerCoin` for that currency (`orderBy(desc(createdAt)).limit(1)`), coerced to a number; **throws `ValidationError` if no rate row exists** (no default). Money = `coins × activeRate`. Not cached.
- **Labels:** `eventLabel(event: string)` (`components/notifications/template-status.tsx`) is a pure `snake_case → "Title case"` transform (no lookup table) — pass any `eventType` straight in.
- **List framework:** `FacetDef` / `parseFilterState` / `FacetFilters` / `ListPagination` (`packages/design-system/src/filters` + `list-pagination.tsx`), backed by `@realm/commons` `Condition` + `@realm/database` `conditionToSql`/columnResolver. The **admin wallet ledger** (`app/(dashboard)/dashboard/wallet/ledger`) is the reference wiring to mirror. Gotchas (from prior rollout): don't name the service method `list`; resolve FK filters via subquery; watch the field-name runtime trap (facet field names must match resolver columns).
- **Customer wallet today** = the home `WalletSection` (`components/customer/home/wallet-section.tsx`): balance `AnimatedNumber` + up to 10 `WalletTxRow`s + `LottieEmptyState` (coin-burst). Loaded in `me/page.tsx` via `walletService.balance` + `recentTransactions(userId, 10)`.
- **coin-burst lottie now renders** (fixed 2026-07-15, images embedded).

## Decisions (locked)

- **Full `FacetFilters` + `ListPagination` framework** for the coins log (consistent with admin; rich earn/spend/date filtering).
- **Hero:** big coin balance (`AnimatedNumber` + coin-burst flourish) with its **"≈ $X.XX"** money value (`coins × activeRate`) + two **earn/spend total** tiles (coins). **Per-row shows coins only** (money only on the hero).
- **Dedicated `/me/wallet` route**; the home `WalletSection` becomes a compact peek linking to it.
- **Display-focused slice** — no customer-initiated redeem/spend flow (redeem exists for checkout; a redeem UI is out of scope), no coin-rate editing (admin), no earning-mechanics change.

## Design

### A. Backend — new reads on `walletService` (no schema change)
- **`ledgerPage(userId, filter, page)`** — paginated + filterable coins-log read, wired through the list framework (`Condition` on `direction`, `eventType`, `createdAt` range), scoped by `userId`. Returns rows (`WalletTx`-shaped) + pagination meta. **Do not name it `list`** (framework gotcha). Mirror the admin ledger read.
- **`earnSpendTotals(userId): { earned: number; spent: number }`** — one grouped aggregate: `sum(coins)` where `direction = credit` (earned) vs `debit` (spent).
- **`moneyValue(coins, currency): number | null`** — thin wrapper: try `activeRate(currency)` → `coins × rate`; on the `ValidationError` (no rate) return `null` so the UI degrades to coins-only. (Never let a missing rate blank the whole wallet.)
- Currency source: app default currency (`getAppSettings()` — confirm the field at plan time; `redeem` uses `order.currency`, and `coin_rate.currency` is the key). One currency for the customer view.
- All reads scoped by `userId` (wallet is inherently user-owned; the filter enforces IDOR — no cross-user rows).

### B. Route + nav
- **`app/(customer)/me/wallet/page.tsx`** — resolve `currentUserId()`; load `balance`, `earnSpendTotals`, `moneyValue(balance, currency)`, and the first page of `ledgerPage` (`parseFilterState(searchParams)`). Render `<WalletHero>` + `<EarnSpendTiles>` + `<WalletLog>`. Role-gated by the `(customer)` layout.
- **Nav:** add a "Wallet" entry to `CustomerBottomNav` + `CustomerSidebar` (Slice-0 `TransitionLink`). The home `WalletSection` peek also links to `/me/wallet`.

### C. Components (`components/customer/wallet/`)
- **`<WalletHero>`** — big coin balance (`AnimatedNumber`), a coin-burst `<Lottie>` flourish, and "≈ $X.XX" money value (omitted when `moneyValue` is `null`).
- **`<EarnSpendTiles>`** — two tiles: total earned / total spent coins (`AnimatedNumber`), tinted ok/bad.
- **`<WalletLog>`** — `<FacetFilters>` (facets: direction = All/Earned/Spent; optionally event type + date range) + rows (`eventLabel(eventType) ?? sourceType`, `memo`, `±coins` colored by direction, `formatEpoch(createdAt)`) + `<ListPagination>`. `Reveal.Group` stagger. Empty → `LottieEmptyState` (coin-burst).
- **Home `WalletSection` → compact peek** — keep balance + money value + a few recent rows, add a "View wallet →" `TransitionLink` to `/me/wallet`. (Trim, don't duplicate the full log.)

### D. Motion (Slice 0 reuse)
coin-burst on the hero; `AnimatedNumber` for balance/money/totals; `Reveal.Group` on log rows; reduced-motion honored.

## Non-goals
- Customer-initiated redeem/spend UI (redeem is a checkout concern; out of scope).
- Coin-rate editing, payout config, earning-rule changes (all admin).
- Any DB schema/enum change. Any change to the money `ledgerEntries`/analytics.

## Testing / verify contract
- **Service tests** (live-DB, Slice-4 harness + direct `wallet_ledger` inserts): `ledgerPage` filters earn vs spend + paginates + is user-scoped (IDOR: user B's rows never returned); `earnSpendTotals` sums credit/debit correctly; `moneyValue` returns `coins × rate` and **`null` when no coin_rate row** (no throw leaking to the page).
- **Component tests** (jsdom): `WalletHero` shows coins + "≈ $" (and hides "≈ $" when money null); `EarnSpendTiles` shows both totals; `WalletLog` renders rows + the earn/spend filter changes results (mock the read).
- `pnpm turbo typecheck && pnpm turbo test`.
- Eyeball: `/me/wallet` renders; filter toggles; pagination pages; coin-burst animates (now fixed); a user with no coin_rate row still sees coins (money hidden, no error).

## Risks
- **`activeRate` throws when no rate exists** → `moneyValue` MUST catch and return `null`; the page must never 500 because a currency has no `coin_rate` row.
- **List-framework wiring** — honor the gotchas (method not named `list`, FK-via-subquery, facet field-name↔resolver-column match); mirror the admin ledger closely.
- **Currency** — pick one app currency; if multi-currency later, revisit. Confirm the app-settings field at plan time.
- **Pricing/amounts** stay server-side; `moneyValue` is display-only (coins × rate), never a spend authorization.
