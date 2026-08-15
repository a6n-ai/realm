# Puchkaman Wallet Wiring — Implementation Plan (Slice 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give puchkaman a coins wallet — customers earn on paid orders and spend coins as a Clover discount at checkout.

**Architecture:** The tables come from `@realm/wallet`'s `makeWalletTables` factory, passing puchkaman's existing `app_event` and `ledger_direction` enums. Earning fires from `settlePaid`, the single funnel both the Clover webhook and the admin "Check status" reach. Spending becomes another Clover discount line in `createCheckout` — Clover prices it and `payOrder` bills the Clover total, so quoted equals charged by construction. **Coins are debited in the same transaction that creates the order**, and credited back by a new `reverseRedemption` primitive if the order fails or is cancelled.

**Tech Stack:** Next.js 16, Drizzle on Postgres, `@realm/wallet`, `@realm/clover`, Vitest with live-DB integration tests.

**Spec:** `docs/superpowers/specs/2026-08-14-puchkaman-customer-accounts-design.md` (Slice 4, revised 2026-08-15)

## Why the debit timing differs from tiffin-grab

tiffin-grab defers the debit to `verifyPayment`. Copying that here would be actively worse. In puchkaman the coin discount is committed to the **Clover order** at creation and `payOrder` bills the Clover total, so the customer pays the reduced price first. If the balance no longer covered the redemption at settlement time, the payment would already have completed and could not be settled. Debiting at creation makes the balance authoritative at the moment the discount comes into existence.

The cost is a reversal path, which is Task 2.

## Global Constraints

- Work in `/Users/lawbringr/IdeaProjects/realm-wt-3c88e511` on branch `wt/3c88e511`. Never the shared checkout. **Another agent commits to this repo concurrently** — before starting, `git fetch origin` and check whether `origin/main` has moved; if it has, stop and report rather than merging mid-plan.
- `docs/` is gitignored (`.gitignore:63`); doc commits need `git add -f`.
- Verify after each task: `pnpm turbo typecheck` and the suites the task names. **Do NOT use puchkaman's full suite as a gate** without first establishing a baseline — record pass/fail counts before your change so you can tell your breakage from anything pre-existing.
- **Clover is the authority on price and tax.** Never compute a total locally and charge it. Every discount must reach Clover as a discount line; a local-only deduction means quoted ≠ charged.
- Money amounts are server-side only. The client may send a coin COUNT, never an amount.
- Audit fields come from the session, never from input.
- Never rewrite an applied migration. Next number is `0019`.
- `psql` at `/Applications/Postgres.app/Contents/Versions/latest/bin/psql`, DB `postgres://localhost:5432/puchkaman`.
- Comment the non-obvious *why* only. `rg`/`fd` over `grep`/`find`.

## Reference points established by mapping

Use these rather than re-deriving them; verify each by content before editing, since line numbers drift.

| What | Where |
|---|---|
| Discounts assembled for Clover | `lib/services/orders.service.ts` — `claimed`/`cloverDiscounts` around :561, `atomicInput.discounts` around :653-672 |
| Clover prices the cart | `client.checkoutAtomicOrder(atomicInput)` around :679; `subtotalCharged`/`tax`/`total` around :688-690 |
| Order-creation transaction | `db.transaction` around :716; `insert(orders)` around :791; existing discount `ledgerService.record` around :824-833 |
| Clover order pushed after commit | around :857-869 |
| Single settlement funnel | `settlePaid` (private) around :1270; reached from `payCheckout` (:947), `applyRemotePaymentStatus` (:1198) |
| Both confirmation surfaces | webhook `app/api/integrations/clover/webhook/route.ts` → `handleCloverWebhookUpdates` (:1097); admin `app/api/orders/[id]/payment-status/route.ts` → `checkPaymentStatus` (:980) |
| Failure path | `markPaymentFailed` around :1217 |
| Ledger writes | `lib/services/ledger.service.ts` `record(tx, input)`; `ledger_entry_type` includes `discount` |
| Reference wiring | `apps/tiffin-grab/lib/services/wallet.service.ts` — the working `createWalletService` call |

---

### Task 1: `reverseRedemption` in `@realm/wallet`

**Files:**
- Modify: `packages/wallet/src/service.ts`
- Modify: `packages/wallet/src/__tests__/lock-order.test.ts` (add cases)

**Interfaces:**
- Produces: `reverseRedemption(tx, { userId, orderId, walletLedger, users, orders }): Promise<{ coinsReturned: number }>`, exported from the package.
- Task 5 calls it on the failure and cancellation paths.

Credits back the coins from the redemption recorded against an order. Must be **idempotent** — calling it twice returns the coins once — and must be a no-op when the order has no redemption.

- [ ] **Step 1: Read the existing primitives**

Read `commitRedemption` in `packages/wallet/src/service.ts` in full. The reversal mirrors it: same lock order (**user then order** — this is a fixed invariant across the package), same dedupe-by-query approach, opposite direction. Match its shape rather than inventing one.

- [ ] **Step 2: Write the failing tests**

Extend `packages/wallet/src/__tests__/lock-order.test.ts` with a `reverseRedemption` block pinning:
- locks are taken **user then order**, before any read or write (the same assertion style the existing tests use, identifying each lock by the table it names, not by call position);
- a second call writes nothing and reports zero returned;
- an order with no redemption writes nothing rather than throwing.

- [ ] **Step 3: Run to verify they fail**

Run: `cd packages/wallet && pnpm vitest run`
Expected: FAIL — `reverseRedemption` is not exported.

- [ ] **Step 4: Implement**

Write it in `packages/wallet/src/service.ts`:
- take the user lock, then the order lock;
- find the redemption debit for `(sourceType: "redemption", sourceId: orderId)`;
- if absent, return `{ coinsReturned: 0 }` without writing;
- if a reversal already exists for that order, return `{ coinsReturned: 0 }` without writing — pick a `sourceType` that makes the reversal self-identifying (e.g. `"redemption_reversal"`) and dedupe on it;
- otherwise write a **credit** row for the same coin count, referencing the order, with a memo saying what it reverses.

Do NOT reverse the app's `ledger_entries` discount row from inside the package — that table is app-local. Return the coin count and let the caller decide; note that in the docblock.

- [ ] **Step 5: Run to verify they pass, then verify the repo**

Run: `cd packages/wallet && pnpm vitest run`, then `pnpm turbo typecheck`.

`redeem()` must remain behaviour-identical, and `apps/tiffin-grab/lib/services/__tests__/wallet.service.test.ts` must pass unedited — run it.

- [ ] **Step 6: Commit**

```bash
git add packages/wallet
git commit -m "feat(wallet): idempotent reverseRedemption primitive"
```

---

### Task 2: Puchkaman wallet schema

**Files:**
- Create: `apps/puchkaman/db/schema/wallet.ts`
- Modify: `apps/puchkaman/db/schema/index.ts`
- Modify: `apps/puchkaman/package.json` (add `@realm/wallet`)
- Create: `apps/puchkaman/db/migrations/0019_*.sql` (generated)
- Create: `apps/puchkaman/db/__tests__/wallet-schema.test.ts`

**Interfaces:**
- Produces: `walletLedger`, `eventPayout`, `coinRate` exported from `apps/puchkaman/db/schema/wallet.ts` and re-exported from the barrel.

Mirror `apps/tiffin-grab/db/schema/wallet.ts` — a factory call, nothing more. **Pass puchkaman's existing enums**: `appEvent` from `./events` (9 values, unchanged — do not add wallet-only values to it, it is the app-wide notification catalog) and `ledgerDirection` from `./orders`.

- [ ] **Step 1: Add the dependency**

Add `"@realm/wallet": "workspace:*"` to `apps/puchkaman/package.json`, matching the version-string style of its sibling `@realm/*` deps. Run `pnpm install` and commit the lockfile change with this task.

- [ ] **Step 2: Write the failing test**

Create `apps/puchkaman/db/__tests__/wallet-schema.test.ts` asserting the three tables exist with the right names, that `wallet_earn_idempotent_idx` is unique on `(source_type, source_id, event_type)`, and that `event_payout.event_type` is unique. Model it on `packages/wallet/src/__tests__/schema.test.ts`.

- [ ] **Step 3: Run to verify it fails, then write the schema**

`apps/puchkaman/db/schema/wallet.ts`:

```ts
import { makeWalletTables } from "@realm/wallet/schema";
import { appEvent } from "./events";
import { ledgerDirection, orders } from "./orders";
import { users } from "./auth";

// Puchkaman's app_event is the app-wide notification catalog, not a wallet
// list — it stays exactly as it is and the factory takes it as a parameter.
export const { walletLedger, eventPayout, coinRate } = makeWalletTables({
  users,
  orders,
  appEvent,
  ledgerDirection,
});
```

Verify the real import paths for `ledgerDirection` and `orders` before writing — the map places both in `db/schema/orders.ts`.

Re-export from `db/schema/index.ts` following how the barrel exports its siblings.

- [ ] **Step 4: Generate and inspect the migration**

Run: `pnpm --filter puchkaman db:generate`

Open `0019_*.sql`. It must contain only the three `CREATE TABLE`s plus their indexes and FKs. If drizzle-kit emits anything else — a dropped index, a recreated enum, a missing `next_id()`/`current_app_id()` default, a dropped `app_id` FK DO-block — STOP and report rather than applying. This repo has a known drizzle-kit squash bug of that shape. Do not edit any migration numbered `0018` or lower.

- [ ] **Step 5: Apply and verify**

Run: `pnpm --filter puchkaman db:migrate`, then confirm with `psql`:

```bash
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"
psql "postgres://localhost:5432/puchkaman" -c "\d wallet_ledger"
psql "postgres://localhost:5432/puchkaman" -c "\d event_payout"
psql "postgres://localhost:5432/puchkaman" -c "\d coin_rate"
```

Confirm the unique idempotency index and both lookup indexes exist. Paste the output into your report.

- [ ] **Step 6: Verify and commit**

Run: `pnpm turbo typecheck && pnpm --filter puchkaman test`

```bash
git add apps/puchkaman/db apps/puchkaman/package.json pnpm-lock.yaml
git commit -m "feat(puchkaman): wallet tables from the shared factory"
```

---

### Task 3: The app-local wallet service

**Files:**
- Create: `apps/puchkaman/lib/services/wallet.service.ts`
- Create: `apps/puchkaman/lib/services/__tests__/wallet-service-wiring.test.ts`

**Interfaces:**
- Produces: `walletService` (the `createWalletService` instance), `type BusinessEvent`, `type WalletTx`, plus app-local wrappers `lockAndQuoteCoinRedemption`, `commitCoinRedemption`, `reverseCoinRedemption` that pass the tables so callers do not repeat them.
- Tasks 4, 5 and 6 consume these.

**Read `apps/tiffin-grab/lib/services/wallet.service.ts` first and mirror it.** It is the working reference: how `createWalletService` is called, how `recordRedemptionDiscount` is typed via `WalletDeps` so the transaction handle matches, and how the wrappers thread the tables.

Differences for puchkaman: no wallet cap (skip `canAward` entirely — tiffin's cap is its own feature), and `recordRedemptionDiscount` writes puchkaman's `ledger_entries` via its own `ledgerService.record(tx, …)` rather than a raw insert, since puchkaman has a ledger service and the append-only rule lives there.

- [ ] **Step 1: Write the failing test**

`wallet-service-wiring.test.ts` — assert the service exposes the methods callers need (`balance`, `award`, `activeRate`, `moneyValue`) and that `BusinessEvent` narrows to puchkaman's 9 `app_event` values rather than widening to `string`. A widened type would silently accept a misspelled event that then finds no payout row and awards nothing.

- [ ] **Step 2: Implement, verify, commit**

Run: `pnpm turbo typecheck && pnpm --filter puchkaman test`

```bash
git add apps/puchkaman/lib/services
git commit -m "feat(puchkaman): app-local wallet service wiring"
```

---

### Task 4: Earn coins when a payment settles

**Files:**
- Modify: `apps/puchkaman/lib/services/orders.service.ts` (`settlePaid`)
- Create: `apps/puchkaman/lib/services/__tests__/wallet-earning.test.ts`

**Interfaces:**
- Consumes: `walletService.award` (Task 3).

`settlePaid` is the single funnel — both the Clover webhook and the admin "Check status" reach it through `applyRemotePaymentStatus`. One award call covers both surfaces.

- [ ] **Step 1: Read `settlePaid` in full**

Note what is already in its transaction: the payment update, the order update, the two `enqueueNotification` calls, and the `ledgerService.record` payment credit. The award goes alongside those, and `order.userId` is already in scope — **it is nullable for guest orders**, so the award must be skipped rather than crashing when it is null.

- [ ] **Step 2: Write the failing tests**

Cover: a paid order awards coins for `order_paid` when that payout row is enabled; a guest order (null `userId`) awards nothing and does not throw; a disabled or zero payout awards nothing; settling the same order twice awards once (the idempotency index does this — assert it rather than assuming).

- [ ] **Step 3: Implement**

Award `order_paid` with `{ type: "order", id: order.publicId }` as the source, so the idempotency index keys on the order.

**Wrap it in try/catch and log on failure.** An award must never fail a settlement — the customer has paid, and losing the payment record over a loyalty write would be a far worse bug than a missing award. Follow how tiffin-grab guards its three award call sites.

Decide whether the award runs inside `settlePaid`'s transaction or after it, and justify it in your report. Inside is atomic but a failure rolls back the settlement unless caught; outside cannot roll back the payment but can be lost. Tiffin-grab awards outside the transaction — read why before choosing differently.

- [ ] **Step 4: Verify and commit**

Run: `pnpm turbo typecheck` and the new suite plus any existing `orders.service` suites.

```bash
git add apps/puchkaman/lib/services
git commit -m "feat(puchkaman): award coins when a payment settles"
```

---

### Task 5: Spend coins as a Clover discount

**Files:**
- Modify: `apps/puchkaman/lib/services/orders.service.ts` (`createCheckout`)
- Create: `apps/puchkaman/lib/services/__tests__/wallet-redemption.test.ts`

**Interfaces:**
- Consumes: `lockAndQuoteCoinRedemption`, `commitCoinRedemption` (Task 3).
- Produces: the checkout input gains `coins?: number` — a COUNT, never an amount.

This is the money-critical task. The sequence, all inside the existing structure:

1. **Before** the Clover call, resolve the coin discount: quote it against the remaining subtotal after the existing discounts, and push it onto `cloverDiscounts` as another named line. Clover then prices the cart *with* it, and `payOrder` bills that total — quoted equals charged by construction.
2. **Inside** the order-creation transaction, after the order row is inserted, commit the redemption with the real `order.id`.
3. The existing `ledgerService.record` discount row already covers the money side; the injected `recordRedemptionDiscount` writes the coin-specific one. Make sure the two do not double-count — read what the existing discount ledger write records and report how you kept them distinct.

- [ ] **Step 1: Read the discount assembly and the transaction in full**

`createCheckout` from the `claimed`/`cloverDiscounts` assembly through to the Clover push after commit. Understand where `discountAmount` feeds the forecast, the snapshot, and the ledger write.

- [ ] **Step 2: Write the failing tests**

Cover, asserting on persisted rows:
- a signed-in customer with a balance spends coins: the coin discount appears in the Clover payload, `orders.total` reflects it, a `wallet_ledger` debit exists for the order, and the balance drops;
- coins cap at the remaining subtotal after the existing discounts, and never make the total zero or negative (`createCheckout` throws when `total <= 0` — assert coins cannot trigger that);
- coins stack with a coupon without the combined discount exceeding the subtotal;
- a guest (no session) cannot redeem;
- more coins than the balance fails the checkout with a clear error rather than silently pricing at full.

The Clover client must be stubbed — do not call the real API. Follow how the existing `orders.service` tests stub it.

- [ ] **Step 3: Implement, verify, commit**

Lock order is **user then order**, always. The quote takes the user lock; the commit takes the order lock. Quote before the order insert, commit after — never the reverse, or a concurrent path can deadlock against it.

```bash
git add apps/puchkaman/lib/services
git commit -m "feat(puchkaman): spend coins as a Clover discount at checkout"
```

---

### Task 6: Give coins back when an order fails or is cancelled

**Files:**
- Modify: `apps/puchkaman/lib/services/orders.service.ts` (`markPaymentFailed`, and the cancellation path)
- Modify: `apps/puchkaman/lib/services/__tests__/wallet-redemption.test.ts` (add cases)

**Interfaces:**
- Consumes: `reverseCoinRedemption` (Tasks 1 and 3).

Coins were debited at order creation. If the order never gets paid, they must come back.

- [ ] **Step 1: Find every terminal-failure path**

`markPaymentFailed` is one. Search for where an order reaches `cancelled` or `failed` — there may be an admin cancel action and a Clover-webhook failure route. List them all in your report; a path you miss is coins the customer never gets back.

- [ ] **Step 2: Write the failing tests**

A failed order returns the coins and the balance is restored; the reversal is idempotent (fail twice, coins returned once); an order with no redemption is unaffected. Also assert the app's `ledger_entries` side is consistent with whatever you decide — say in your report whether a reversing money-ledger row is written, and why.

- [ ] **Step 3: Implement, verify, commit**

```bash
git add apps/puchkaman/lib/services
git commit -m "feat(puchkaman): return coins when an order fails or is cancelled"
```

---

### Task 7: Admin wallet settings

**Files:**
- Create: `apps/puchkaman/app/(dashboard)/dashboard/settings/wallet/page.tsx` and its actions/components
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/settings/page.tsx` (hub entry)

Payout grid (enable an event, set its coins) and coin rate (currency, value per coin). Behind `requireAdmin`.

- [ ] **Step 1: Read both references**

tiffin-grab's `app/(dashboard)/dashboard/wallet/` for the payout grid and coin-rate form, and puchkaman's settings hub for how a section is registered. Puchkaman's hub uses a `SettingsSection[]` array with a plugin gate for some entries — Wallet is **not** plugin-gated, so add it alongside the ungated sections.

- [ ] **Step 2: Build it, verify, commit**

Leave every payout **disabled at 0 coins**, matching tiffin-grab. Turning earning on is an operator decision, not a deployment side effect. Say so in a comment.

```bash
git add "apps/puchkaman/app/(dashboard)/dashboard/settings"
git commit -m "feat(puchkaman): wallet payout and coin-rate settings"
```

---

### Task 8: The checkout control

**Files:**
- Modify: puchkaman's checkout page and its pricing/quote action
- Create: a component test

Show a signed-in customer their balance and let them apply coins; show guests a sign-in prompt.

- [ ] **Step 1: Read puchkaman's checkout**

Find how the cart is priced for display and how the existing coupon input round-trips. Mirror it. Puchkaman's public surfaces are **brutalist** — match the surrounding components, do not import CRM/`@realm/ui` admin styling.

- [ ] **Step 2: Preview must match the charge**

Whatever the page shows as the coin discount must equal what `createCheckout` applies. Share the capping logic rather than duplicating the arithmetic.

- [ ] **Step 3: Build it, verify, commit**

Run `pnpm --filter puchkaman build` as well as typecheck and tests — this touches client components.

```bash
git add apps/puchkaman
git commit -m "feat(puchkaman): use-coins control at checkout"
```

---

### Task 9: End-to-end verification

**Files:** none — verification only.

- [ ] **Step 1: Seed**

Enable the `order_paid` payout temporarily, insert a CAD `coin_rate`, award a test customer some coins through `walletService.award`, confirm the balance. Restore the payout to disabled afterwards.

- [ ] **Step 2: Walk a redemption**

With the Clover client stubbed (or against a real sandbox order if one is available — say which you used), create a checkout spending coins and confirm: the coin discount is in the Clover payload, `orders.total` matches Clover's returned total, the `wallet_ledger` debit exists, the balance dropped, and the money ledger agrees.

- [ ] **Step 3: Walk a reversal**

Fail that order and confirm the coins come back exactly once.

- [ ] **Step 4: Report**

State what you verified against a real database versus a stub, and anything that still needs a human with a Clover sandbox.

---

## Self-Review

**Spec coverage.** Schema via the factory with the existing enums (2), earning at the single settlement funnel (4), spending as a Clover discount line with the debit at creation (5), the reversal that debit timing requires (1, 6), admin settings (7), checkout UI (8). No `/me/wallet` page, per the revised spec.

**Placeholders.** Tasks 7 and 8 are deliberately read-then-mirror — puchkaman's settings hub and brutalist checkout are established patterns, and guessing component APIs has produced wrong imports repeatedly in this program.

**Ordering.** 1 before 6 (the reversal primitive must exist before it is wired). 2 before 3 before everything (tables, then service, then callers). 5 before 6 (there must be a redemption to reverse).

**Biggest risk.** Task 5. It is the one place where a mistake means the customer is quoted one price and charged another — the exact failure this app has hit before. The mitigation is structural: the discount goes to Clover, and Clover's returned total is what gets persisted and billed.
