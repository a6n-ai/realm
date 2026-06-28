# PRD — Coupons & Discounts Module

Status: **As-built** (documents the shipped system) + flagged gaps. Last grounded against code: 2026-06-28.

Source of truth: `apps/web/db/schema/coupons.ts`, `apps/web/lib/services/coupons.service.ts`, `apps/web/lib/services/mint-rep-coupons.ts`, `apps/web/lib/pricing/engine.ts`, `apps/web/app/(dashboard)/dashboard/settings/discounts/*`.

## 1. Purpose

Let the business grant order discounts through one model that serves three audiences:

- **Customers** — type a promo code or get the best eligible promo auto-applied at checkout.
- **Staff/reps** — apply a personal, capped daily discount when placing an order for a customer.
- **Admins** — govern which discount kinds exist, mint/expire coupons, and set per-rep allowance.

Every discount lands as an auditable ledger debit and a redemption row. No discount escapes the ledger.

## 2. Non-goals

- Loyalty points / store credit balances (the ledger has `credit` direction but no balance product is built).
- Referral graphs, gift cards, multi-tenant coupon pools.
- A standalone promo-campaign scheduler — a "festival promo" is just an `autoApply` coupon with a start/expiry window. No new kind, no campaign table.

## 3. Discount kinds (`coupon_kind` enum)

| Kind | Value fields | Behavior |
|------|--------------|----------|
| `percentage` | `valuePct` | `subtotal × pct%`, clamped to subtotal. |
| `fixed` | `valueAmount` | Flat amount, clamped to subtotal. |
| `first_order` | `valuePct` or `valueAmount` + `config.mode` | Percentage or fixed; rejected if the user has any prior order. |
| `free_delivery` | — | **Placeholder — resolves to $0.** Blocked on the pricing engine exposing a discrete delivery line. See §9. |
| `rep_daily` | `capPct` + `capAmount` | Staff lane. Owner-bound, dual-ceiling, daily-budget. See §6. |

Each kind clamps to the subtotal and floors at $0 (`resolveDiscount`). Codes match case-insensitively.

## 4. Constraints (orthogonal to kind)

First-class columns, so eligibility is plain SQL:

- `minSubtotal` — minimum cart spend.
- `maxRedemptions` — global redemption cap.
- `maxPerUser` — per-customer cap.
- `planTypes[]` — restrict to weekly-menu plan types (empty = all).
- `startsAt` / `expiresAt` — validity window, **epoch-ms** (per TD-4 storage convention).
- `stackable` — see §5.
- `autoApply` — applied at checkout with no code needed.
- `active` — soft-delete flag; coupons are **never hard-deleted** (redemptions FK them).

## 5. Stacking & the auto-apply optimizer

`resolveBestCoupons` picks the combination that maximizes customer discount (lowest total):

- An **exclusive** (`stackable=false`) coupon must be used **alone**.
- **Stackable** coupons may all combine; applied against a running remaining-subtotal.
- A typed **manual code** competes against the auto-apply set; if it loses or is invalid, its rejection is returned as `manualError` (non-throwing) and surfaced inline — the auto set still resolves.
- Zero-benefit coupons are skipped so they don't burn a redemption / per-user allowance for $0.
- When a `rep_daily` coupon is also present, the optimizer runs in **`stackableOnly`** mode — an exclusive customer coupon can never legally ride alongside the rep lane, so it's not even enumerated.

> Implementation is a brute-force subset search (`// ponytail:` comment in code). Correct because discounts are non-negative, so the candidate finals are `{all stackable}` and each `{exclusive}` alone. Revisit with greedy/DP only if the active auto-apply catalog grows large.

## 6. Rep daily coupons (staff lane)

- **Minted by cron** (`mint-rep-coupons`, also runnable by hand via `tsx db/mint-rep-coupons.ts`). One coupon per rep per **IST day**, guaranteed by a partial unique index `(ownerUserId, istDate) WHERE kind='rep_daily'`.
- Code format `REP-<istDate>-<repPublicIdSuffix>` — derived from the rep's public id, never the internal bigint.
- **Dual ceiling**: the granted amount is `min(requestedAmount, subtotal×capPct, capAmount)`. The rep names the amount; the caps clamp it.
- **Daily budget**: `dailyUses` is snapshotted onto `maxRedemptions`; `maxPerUser=1` so a rep can't stack their own coupon twice on one customer.
- Only the **owning rep** may apply it (`ownerUserId === actorId`); rejected on any public/customer path.

## 7. Redemption & integrity (`redeem`, tx-aware)

Runs inside the caller's order transaction:

1. **Atomic global-cap guard** — conditional `UPDATE coupons SET redemption_count=redemption_count+1 WHERE id=? AND redemption_count < max_redemptions RETURNING id`. No row returned ⇒ cap hit ⇒ `ValidationError`. The `RETURNING` also **locks the row** for the rest of the tx.
2. **Per-user cap** — counted *under* that lock, so concurrent same-user redeems serialize and the loser sees the winner's committed row.
3. Insert `coupon_redemptions` (couponId, userId, orderId, redeemedBy, amountApplied, context).
4. Record a `discount` **debit** in `ledger_entries`, memo `Coupon <code>`.

Caller (`orders.service.createOrder`) resolves rep coupon → best customer coupons → redeems each in-tx.

## 8. Admin governance

`DiscountPolicy` blob on `app_settings` (mirrors `leadAssignment`), surfaced under **Settings → Discounts**:

- `enabledKinds[]` — which kinds admins may mint.
- `repDaily` — global defaults (`defaultCapPct`, `defaultCapAmount`, `defaultDailyUses`) + `perRep` overrides (`{ capPct?, capAmount?, dailyUses?, active }`).

UI tabs: `kinds/` (kind catalog), `coupons/` (coupon CRUD manager), `rep-allowance/` (per-rep caps). Editors use typed controls per TD-3 (no free-text for enums/dates/refs).

## 9. Known gaps / follow-ups

| Item | State | Action when |
|------|-------|-----------|
| `free_delivery` resolves to **$0** | Placeholder | Pricing engine must emit a discrete delivery line item; then resolve to that line's amount. |
| Optimizer brute-force subset | Acceptable | Move to greedy/DP only if active auto-apply count makes subset search measurably slow. |
| Cron registration | Manual/route exists | Confirm the external scheduler hits `app/api/cron/mint-rep-coupons` daily (IST-anchored), or document the manual run as the contract. |

## 10. Acceptance criteria (regression anchors)

- Discount never exceeds subtotal; total floors at $0.
- A coupon at its global cap rejects atomically under concurrent redemption (no over-redemption).
- A rep's coupon is unusable by any other rep or on a public checkout path.
- Exclusive + stackable never co-apply; the optimizer returns the genuinely-lowest total.
- Every applied discount produces exactly one redemption row and one ledger debit.
- Codes resolve case-insensitively (`save10` → stored `SAVE10`).

Existing coverage: `lib/services/coupons.service` tests, `lib/pricing/engine.test.ts`, `lib/pricing/build-catalog.test.ts`.
