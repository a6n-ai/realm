# Tiffin-grab Coin Redemption at Checkout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in tiffin-grab customer spend wallet coins at checkout, as a discount on their subscription order.

**Architecture:** Coins become a pricing adjustment, exactly like a coupon. `@realm/wallet` gains transaction-aware quote/commit primitives so the redemption can run inside `createOrder`'s existing transaction; `redeem()` keeps its current own-transaction behaviour as a wrapper. On a deferred-settlement payment method the redemption parks in the pricing snapshot and settles at `verifyPayment`, mirroring `pendingRedemptions` for coupons.

**Tech Stack:** Next.js 16 server actions, Drizzle on Postgres, `@realm/wallet`, Vitest with live-DB integration tests.

## Why this is not simply "call `redeem()` at checkout"

Three blockers, all discovered by reading the code:

1. `walletService.redeem` opens its **own** `db.transaction` and takes `SELECT … FOR UPDATE`. `createOrder` already runs inside a transaction on the same connection, so calling it there nests. `couponsService.redeem(tx, …)` and `ledgerService.record(tx, …)` are both tx-aware; wallet is not.
2. `orders.total` is written from `pricing.total` at `orders.service.ts:339`, and `pricing` is computed at `:300` from `adjustments[]`. A discount discovered after that point would leave the order row disagreeing with the ledger.
3. Real payment methods set `deferSettlement`, and coupons handle it by parking `pendingRedemptions` in the snapshot and settling in `verifyPayment` (`orders.service.ts:452-476`). Coins need the same or they are spent on an order that is never paid.

## Decisions already made

- **Deferred settlement: coins defer like coupons.** Parked in the snapshot, debited at `verifyPayment`.
- **Coin earning stays switched off.** Every `event_payout` row is currently `enabled = false, coins = 0`. That is admin configuration at `/dashboard/wallet/payouts`, not code, and this plan does not change it. Spending is wired; turning earning on is the operator's call.
- **Coins cap against the remaining pre-tax subtotal, not `order.total`.** Capping at the total is circular here (the total depends on the discount). Coupons already cap each line against the running remaining subtotal — coins match that. It also means coins never discount tax, which is the correct behaviour.
- **Signed-out checkout cannot use coins.** `/checkout` is public and an anonymous order provisions its customer mid-transaction, so there is no balance to spend. The UI shows a sign-in prompt instead of a coins control.

## Global Constraints

- Work in `/Users/lawbringr/IdeaProjects/realm-wt-3c88e511` on branch `wt/3c88e511`. Never the shared checkout.
- `docs/` is gitignored (`.gitignore:63`); doc commits need `git add -f`.
- **Money path.** Totals are computed server-side only; the client never sends an amount. `CreateOrderInput` has no amount field and must not gain one — it may gain a coin COUNT, which the server prices itself.
- Verify after each task: `pnpm turbo typecheck && cd apps/tiffin-grab && pnpm vitest run <the touched suites>`. Do NOT use the full tiffin suite as a gate — it has ~95 pre-existing failures (inquiries, app-settings, delivery, checkout) from local DB state, unrelated to this work. Compare against the same command on the previous commit.
- `@realm/wallet` is server-only and must stay out of `transpilePackages`.
- The existing five wallet test files and `redeem()`'s current behaviour must not change — `redeem()` has no production caller today, but its tests are the only pin on the money math.
- Never rewrite an applied migration. This work needs none.
- `psql` at `/Applications/Postgres.app/Contents/Versions/latest/bin/psql`, DB `postgres://localhost:5432/tiffin`. App currency is `CAD` and a `coin_rate` row exists for it (`0.1000`).
- Comment the non-obvious *why* only. `rg`/`fd` over `grep`/`find`.

---

### Task 1: Transaction-aware redemption primitives in `@realm/wallet`

**Files:**
- Modify: `packages/wallet/src/service.ts`
- Modify: `packages/wallet/src/__tests__/redeem-math.test.ts` (add cases only)

**Interfaces:**
- Produces, all exported from the package:
  - `lockAndQuoteRedemption(tx, { userId, coins, rate, cap }): Promise<{ coinsSpent: number; currencyValue: number }>` — takes the `FOR UPDATE` lock, reads the balance under it, throws on non-positive or insufficient coins, and returns the capped amounts via the existing `capRedemption`.
  - `commitRedemption(tx, { userId, coins, currencyValue, orderId, memo? }): Promise<void>` — writes the `wallet_ledger` debit and calls the injected `recordRedemptionDiscount`.
  - `assertNotAlreadyRedeemed(tx, orderId): Promise<void>` — the existing duplicate guard, extracted.
- Task 2 calls all three inside `createOrder`'s transaction; Task 3 calls them in `verifyPayment`.

`redeem()` keeps its exact current behaviour by becoming a thin wrapper: `activeRate` → own transaction → `assertNotAlreadyRedeemed` → `lockAndQuoteRedemption` → `commitRedemption`.

- [ ] **Step 1: Read the current implementation**

Read `packages/wallet/src/service.ts` `redeem` in full. The extraction must preserve, in order: the pre-transaction `coins <= 0` fast-fail, `activeRate` outside the transaction, the `FOR UPDATE` lock, the in-transaction balance re-read (the TOCTOU guard — the lock must come first), the duplicate-order check, `capRedemption`, then both writes.

- [ ] **Step 2: Write the failing tests**

Add to `packages/wallet/src/__tests__/redeem-math.test.ts` — pure cases only; the live-DB behaviour is pinned by tiffin-grab's existing suite.

```ts
describe("capRedemption against a subtotal cap", () => {
  it("caps against whatever cap it is given, not a hardcoded total", () => {
    // Checkout caps against the remaining PRE-TAX subtotal, so coins never
    // discount tax. Same function, different cap — this pins that the cap is
    // genuinely a parameter.
    const out = capRedemption(1000, 0.1, 25);
    expect(out.currencyValue).toBeLessThanOrEqual(25);
  });

  it("spends nothing when there is no subtotal left to discount", () => {
    const out = capRedemption(500, 0.1, 0);
    expect(out.currencyValue).toBe(0);
    expect(out.coinsSpent).toBe(0);
  });
});
```

If `capRedemption(500, 0.1, 0)` does not already return zeros, that is a real finding — report it rather than changing the function to suit the test, because `redeem()`'s existing behaviour must not change.

- [ ] **Step 3: Run to see the result**

Run: `cd packages/wallet && pnpm vitest run`
Expected: the new cases pass if `capRedemption` is already cap-generic (likely), fail if it is not. Either way, report which.

- [ ] **Step 4: Extract the three primitives**

Refactor `redeem` into the three exported functions above plus a wrapper. **Behaviour-preserving refactor**: no SQL expression, guard, order of operations, or thrown message changes. The `tx` parameter takes the same transaction type the package already uses for `recordRedemptionDiscount`.

Keep every existing WHY comment with the code it explains — the TOCTOU note goes with the lock-then-read pair, the `ponytail:` note with the lock, the re-cap note with `capRedemption`.

- [ ] **Step 5: Prove `redeem()` is unchanged**

Run: `cd apps/tiffin-grab && pnpm vitest run lib/services/__tests__/wallet.service.test.ts`
Expected: PASS, unedited. That file is the only pin on redemption's live-DB behaviour; if it needs a change, the refactor was not behaviour-preserving.

- [ ] **Step 6: Verify and commit**

Run: `pnpm turbo typecheck && cd packages/wallet && pnpm vitest run`

```bash
git add packages/wallet
git commit -m "feat(wallet): transaction-aware redemption primitives"
```

---

### Task 2: Apply coins as a pricing adjustment in `createOrder`

**Files:**
- Modify: `apps/tiffin-grab/lib/services/orders.service.ts`
- Modify: `apps/tiffin-grab/lib/services/wallet.service.ts` (re-export the new primitives if needed)
- Create: `apps/tiffin-grab/lib/services/__tests__/coin-redemption-checkout.test.ts`

**Interfaces:**
- Consumes: the three primitives from Task 1.
- Produces: `CreateOrderInput` gains `coins?: number` — a COUNT, never an amount. `OrderPricingSnapshot` gains an optional `pendingCoinRedemption: { coins: number; amount: number }`.
- Task 3 settles that pending field; Task 4 sends the count from the UI.

Placement inside the existing transaction, following the coupon lane exactly:

1. After the coupon `adjustments[]` loop (`orders.service.ts:291-298`) and **before** `priceSubscription` at `:300`.
2. Cap against the same running remaining subtotal the coupon loop uses.
3. Push a `PricingLine` so the total already includes it.
4. After the order insert, in the `!deferSettlement` branch alongside `couponsService.redeem` (`:369-380`), call `commitRedemption` with the real `order.id`.
5. When `deferSettlement`, put it in the snapshot instead.

- [ ] **Step 1: Write the failing test**

Create `apps/tiffin-grab/lib/services/__tests__/coin-redemption-checkout.test.ts`. Model the fixture on `wallet.service.test.ts` (a user, a `coin_rate` CAD row, an `event_payout` row, coins seeded via `walletService.award` rather than direct insert) and on the order-creation fixtures in `orders.service.test.ts`.

Cover, at minimum:
- A signed-in customer with a balance passes `coins`; the created order's `total` is lower by the coin value, a `wallet_ledger` debit exists for that order, and a `ledger_entries` `discount` row exists with the matching amount.
- The coin discount is capped at the remaining subtotal — request far more coins than the order is worth and assert the discount never exceeds the subtotal and the balance is only reduced by what was actually spent.
- Coins stack correctly with a coupon: both appear in `adjustments`, and their combined discount does not exceed the subtotal.
- `coins: 0` or omitted behaves exactly as today (no wallet rows written).
- A deferred-settlement method writes NO wallet rows and instead parks `pendingCoinRedemption` in the snapshot.

Assert on the persisted rows, not just return values — the order row's `total` and the two ledger rows are the things that must agree.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/tiffin-grab && pnpm vitest run lib/services/__tests__/coin-redemption-checkout.test.ts`
Expected: FAIL — `coins` is not yet accepted.

- [ ] **Step 3: Implement**

Add `coins?: number` to `CreateOrderInput`. Inside the transaction, after the coupon loop:

```ts
// Coins are a discount like any other: resolved server-side against the
// remaining subtotal, never from a client-sent amount. Capped against the
// PRE-TAX remaining subtotal rather than the order total, both because the
// total is not known until after this adjustment lands and because a
// discount should not erase tax.
let coinRedemption: { coinsSpent: number; currencyValue: number } | null = null;
if (input.coins && input.coins > 0 && userId != null) {
  const priorDiscount = adjustments.reduce((sum, a) => sum + a.amount, 0);
  const remaining = Math.max(0, Math.round((basePricing.subtotal - priorDiscount + Number.EPSILON) * 100) / 100);
  if (remaining > 0) {
    const rate = await walletService.activeRate(currency);
    coinRedemption = await lockAndQuoteRedemption(tx, {
      userId, coins: input.coins, rate, cap: remaining,
    });
    if (coinRedemption.currencyValue > 0) {
      adjustments.push({ label: `Coins (${coinRedemption.coinsSpent})`, amount: coinRedemption.currencyValue });
    }
  }
}
```

`currency` comes from `getAppSettings()` — check how `me/wallet/page.tsx:85` sources it and follow that. Read it OUTSIDE the transaction with the other pre-transaction loads.

Then in the `!deferSettlement` branch after the order insert:

```ts
if (coinRedemption && coinRedemption.coinsSpent > 0) {
  await assertNotAlreadyRedeemed(tx, order.id);
  await commitRedemption(tx, {
    userId,
    coins: coinRedemption.coinsSpent,
    currencyValue: coinRedemption.currencyValue,
    orderId: order.id,
  });
}
```

And extend the snapshot's deferred branch with `pendingCoinRedemption` when `deferSettlement && coinRedemption`.

**Insufficient coins must fail the order**, the same way an invalid manual coupon code does at `:278` — a customer who asked to spend coins they do not have should get a clear `ValidationError`, not a silently full-price order. `lockAndQuoteRedemption` already throws; let it propagate.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/tiffin-grab && pnpm vitest run lib/services/__tests__/coin-redemption-checkout.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove nothing else regressed**

Run: `cd apps/tiffin-grab && pnpm vitest run lib/services/__tests__/orders.service.test.ts lib/services/__tests__/wf3-discounts.service.test.ts lib/services/__tests__/payment-deferral.service.test.ts lib/services/__tests__/payment-e2e-lifecycle.test.ts lib/services/__tests__/wallet.service.test.ts`
Expected: PASS, all unedited.

- [ ] **Step 6: Verify and commit**

Run: `pnpm turbo typecheck`

```bash
git add apps/tiffin-grab/lib/services
git commit -m "feat(tiffin-grab): spend wallet coins at checkout"
```

---

### Task 3: Settle a deferred coin redemption at `verifyPayment`

**Files:**
- Modify: `apps/tiffin-grab/lib/services/orders.service.ts` (`verifyPayment`)
- Modify: `apps/tiffin-grab/lib/services/__tests__/coin-redemption-checkout.test.ts` (add cases)

**Interfaces:**
- Consumes: `pendingCoinRedemption` from Task 2; `commitRedemption` from Task 1.

`verifyPayment` already settles pending coupons at `orders.service.ts:452-476` and then strips `pendingRedemptions` from the snapshot. Coins follow the same three beats: settle, strip, persist.

- [ ] **Step 1: Write the failing tests**

Add cases: a deferred order with `pendingCoinRedemption` that is then verified must write the `wallet_ledger` debit and the `ledger_entries` discount, reduce the balance, and leave `pendingCoinRedemption` absent from the stored snapshot. Verifying the SAME payment twice must not double-spend — assert the balance after a second call is unchanged.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/tiffin-grab && pnpm vitest run lib/services/__tests__/coin-redemption-checkout.test.ts`
Expected: the new cases FAIL.

- [ ] **Step 3: Implement**

In `verifyPayment`, after the pending-coupon loop and before the snapshot rewrite, settle the coin redemption from `snap.pendingCoinRedemption` using `assertNotAlreadyRedeemed` + `commitRedemption`. Include `pendingCoinRedemption` in the keys stripped from the snapshot, and make the "did anything change" condition account for it — today the rewrite is gated on `pending.length`, which would skip a coins-only order.

Note `verifyPayment` early-returns at `:419` when the payment is already `paid`/`simulated_paid`, which is the primary double-verify guard; `assertNotAlreadyRedeemed` is the belt-and-braces second one.

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/tiffin-grab && pnpm vitest run lib/services/__tests__/coin-redemption-checkout.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `pnpm turbo typecheck && cd apps/tiffin-grab && pnpm vitest run lib/services/__tests__/payment-deferral.service.test.ts lib/services/__tests__/payment-e2e-lifecycle.test.ts`

```bash
git add apps/tiffin-grab/lib/services
git commit -m "feat(tiffin-grab): settle deferred coin redemption on payment verify"
```

---

### Task 4: The checkout control

**Files:**
- Modify: `apps/tiffin-grab/app/(public)/subscribe/actions.ts` (`reprice`)
- Modify: `apps/tiffin-grab/app/(public)/checkout/actions.ts` (`confirmSubscription`)
- Modify: `apps/tiffin-grab/components/checkout/checkout.tsx`
- Create: `apps/tiffin-grab/components/checkout/__tests__/coins.test.tsx`

**Interfaces:**
- Consumes: `coins` on `CreateOrderInput` (Task 2).
- Produces: `reprice` returns `coinBalance: number | null` and prices a requested coin count.

Model the control on the existing coupon input at `checkout.tsx:358-374` — local state, a server action for the preview, a plain field on the confirm payload. Do not invent a different interaction.

- [ ] **Step 1: Read the coupon control end to end**

`checkout.tsx:46-49` (state), `:102-125` (`applyCoupon`), `:141-147` (confirm payload), `:339-377` (the summary panel), and `subscribe/actions.ts:57-114` (`reprice`). The coins control mirrors this shape.

- [ ] **Step 2: Extend `reprice`**

`reprice` already resolves the session user to a bigint (`subscribe/actions.ts:91-96`) for coupon eligibility. Return the coin balance alongside, and accept a requested coin count so the preview total matches what checkout will charge. Cap the preview the same way the server will — reuse `capRedemption` rather than duplicating the arithmetic, or the preview and the order will disagree.

Signed out → `coinBalance: null`.

- [ ] **Step 3: Write the failing component test**

Create `apps/tiffin-grab/components/checkout/__tests__/coins.test.tsx`, modelled on `checkout-validation-preserved.test.tsx` (which already covers the coupon error state). Cover: the control is absent when `coinBalance` is null (signed out); it appears with a balance; applying coins re-prices; the applied discount shows in the summary; and asking for more coins than the balance surfaces an error rather than silently succeeding.

- [ ] **Step 4: Run to verify it fails, then implement**

Run: `cd apps/tiffin-grab && pnpm vitest run components/checkout/__tests__/coins.test.tsx`

Then add the control and pass `coins` through `confirmSubscription` to `createOrder`. `"use client"` stays line 1 of `checkout.tsx`; no client symbol may be demoted from a named export.

- [ ] **Step 5: Verify and commit**

Run: `pnpm turbo typecheck && cd apps/tiffin-grab && pnpm vitest run components/checkout app/\(public\)/checkout && pnpm --filter tiffin-grab build`

```bash
git add apps/tiffin-grab
git commit -m "feat(tiffin-grab): use-coins control at checkout"
```

---

### Task 5: End-to-end verification

**Files:** none — verification only.

- [ ] **Step 1: Seed a spendable balance**

The local DB has a CAD `coin_rate` of `0.1000` and every `event_payout` disabled. Temporarily enable one payout, award coins to a test customer through `walletService.award` (not a direct insert — the idempotency index is part of what makes awards safe), then confirm a balance via `walletService.balance`. Restore the payout row's `enabled` to `false` afterwards: this plan does not turn earning on.

- [ ] **Step 2: Walk a redemption**

Place an order through `createOrder` with `coins` set, against a simulated (immediate-settlement) method. Then query and paste into your report:

```sql
select o.public_id, o.total, o.pricing_snapshot->'adjustments' as adjustments
  from orders o where o.public_id = '<publicId>';
select direction, coins, source_type, source_id, memo from wallet_ledger where order_id = <id>;
select direction, type, amount, memo from ledger_entries where order_id = <id>;
```

Confirm: the order total is reduced by exactly the discount, the `wallet_ledger` debit matches the coins spent, and the `ledger_entries` discount matches the currency value.

- [ ] **Step 3: Walk the deferred path**

Same but with a real payment method. Confirm no wallet rows exist and `pending_coin_redemption` sits in the snapshot; then verify the payment and confirm the rows appear and the snapshot key is gone.

- [ ] **Step 4: Report**

State whether the order total, the wallet debit and the money ledger agree in both paths, and anything you could not verify.

---

## Self-Review

**Coverage.** The three blockers each have a task: tx-awareness (1), the ordering/pricing problem (2), deferred settlement (3). The UI is 4 and verification is 5.

**Placeholders.** Task 2 Step 3 gives the real insertion code; Task 4 is deliberately read-then-mirror because the coupon control is the template and guessing a component API has produced wrong imports repeatedly in this program.

**Money-path checks.** No client-sent amount: `coins` is a count and the server prices it. Both persisted writes happen in the same transaction as the order. Deferred orders write nothing until payment verifies. The cap is applied against the remaining subtotal so combined discounts cannot exceed it.

**Biggest risk.** Task 1 is a behaviour-preserving refactor of the only money code in the package. Its gate is that tiffin-grab's existing `wallet.service.test.ts` passes unedited.
