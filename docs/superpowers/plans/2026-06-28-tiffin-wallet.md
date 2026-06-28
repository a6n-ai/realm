# Tiffin Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coin wallet — append-only ledger, admin-configured per-event payouts and coin→currency rate, idempotent earns, and spend-as-discount at checkout.

**Architecture:** New `apps/web/db/schema/wallet.ts` with a shared `business_event` enum, append-only `wallet_ledger`, `event_payout` config, versioned `coin_rate`. A `WalletService` computes balance (sum), awards coins on business events (idempotent via unique index), and redeems coins as an order discount reusing the existing order ledger `discount` path. Admin edits payouts + rate via typed settings controls.

**Tech Stack:** TypeScript, Drizzle ORM (Postgres), drizzle-kit, Vitest (live-DB harness), Next.js (settings UI), React Hook Form.

## Global Constraints

- Shared write/audit behavior comes from `SessionUpdatableService`/`UpdatableService` — wallet services extend those, override create/update calling super (services-extend-commons convention).
- Coins are whole numbers → `integer`. Currency values → `numeric(10,2)`; the rate → `numeric(10,4)`.
- Timestamps epoch-ms `bigint`; ids internal `bigint`, public `xxx_<nanoid>`.
- Reuse `ledgerDirection` (`debit|credit`) from `coupons.ts` — do not redefine.
- Reuse `baseColumns`/`updatableColumns` from `@tiffin/commons-drizzle`.
- Migrations via `pnpm --filter web db:generate`; never hand-edit the `next_id()` baseline preamble.
- Live-DB tests hit the real seeded Postgres — never delete shared fixtures (`usr_system`); create + clean up your own rows.
- Money/idempotency are non-trivial paths: every such task leaves a runnable test.

---

### Task 1: Wallet schema + shared `business_event` enum

**Files:**
- Create: `apps/web/db/schema/wallet.ts`
- Modify: `apps/web/db/schema/index.ts` (export wallet)
- Create (generated): `apps/web/db/migrations/<n>_*.sql`

**Interfaces:**
- Produces: `businessEvent` pgEnum; tables `walletLedger`, `eventPayout`, `coinRate`.

- [ ] **Step 1: Write the schema**

Create `apps/web/db/schema/wallet.ts`:
```ts
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
```
> Confirm the import paths for `users` (`./auth`) and `orders` (`./orders`) match the actual exports — adjust if the symbols live elsewhere.

- [ ] **Step 2: Export from the schema barrel**

In `apps/web/db/schema/index.ts`, add: `export * from "./wallet";`

- [ ] **Step 3: Generate + apply the migration**

Run: `pnpm --filter web db:generate` then `pnpm --filter web db:migrate`
Expected: new enum + three tables created; confirm the unique index `wallet_earn_idempotent_idx` is present.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/db/schema/wallet.ts apps/web/db/schema/index.ts apps/web/db/migrations
git commit -m "feat(wallet): schema — business_event enum, ledger, payout, coin_rate"
```

---

### Task 2: `WalletService.balance` + `award` (earn, idempotent)

**Files:**
- Create: `apps/web/lib/services/wallet.service.ts`
- Test: `apps/web/lib/services/__tests__/wallet.service.test.ts` (create)

**Interfaces:**
- Produces:
  - `balance(userId: bigint): Promise<number>` — `sum(credit) − sum(debit)` coins.
  - `award(userId: bigint, eventType: BusinessEvent, source: {type: string; id: string}, memo?: string): Promise<boolean>` — returns true if a credit was written, false if disabled/zero/duplicate.

- [ ] **Step 1: Write the failing test** (live-DB, mirrors `feature-flags.service.test.ts` style)

Create `apps/web/lib/services/__tests__/wallet.service.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { eventPayout, walletLedger, users } from "@/db/schema";
import { walletService } from "../wallet.service";

let userId: bigint;

beforeAll(async () => {
  const [u] = await db.insert(users).values({ /* minimal required fields */ }).returning();
  userId = u.id;
  await db.insert(eventPayout).values({ eventType: "order_activated", enabled: true, coins: 50 })
    .onConflictDoUpdate({ target: eventPayout.eventType, set: { enabled: true, coins: 50 } });
});
afterAll(async () => {
  await db.delete(walletLedger).where(eq(walletLedger.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("WalletService earn", () => {
  it("awards coins for an enabled event and reflects balance", async () => {
    const wrote = await walletService.award(userId, "order_activated", { type: "order", id: "ord_test1" });
    expect(wrote).toBe(true);
    expect(await walletService.balance(userId)).toBe(50);
  });

  it("is idempotent — same source does not double-pay", async () => {
    await walletService.award(userId, "order_activated", { type: "order", id: "ord_test1" });
    expect(await walletService.balance(userId)).toBe(50);
  });

  it("no-ops for a disabled/unknown event", async () => {
    const wrote = await walletService.award(userId, "order_completed", { type: "order", id: "ord_test2" });
    expect(wrote).toBe(false);
  });
});
```
> Fill the `users` insert with the minimal non-null columns from `auth.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test wallet.service`
Expected: FAIL — `wallet.service` not found.

- [ ] **Step 3: Implement `WalletService`**

Create `apps/web/lib/services/wallet.service.ts`:
```ts
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { eventPayout, walletLedger } from "@/db/schema";

export type BusinessEvent = (typeof walletLedger.eventType.enumValues)[number];

class WalletService {
  async balance(userId: bigint): Promise<number> {
    const [row] = await db
      .select({
        bal: sql<number>`coalesce(sum(case when ${walletLedger.direction} = 'credit' then ${walletLedger.coins} else -${walletLedger.coins} end), 0)::int`,
      })
      .from(walletLedger)
      .where(eq(walletLedger.userId, userId));
    return row?.bal ?? 0;
  }

  async award(
    userId: bigint,
    eventType: BusinessEvent,
    source: { type: string; id: string },
    memo?: string,
  ): Promise<boolean> {
    const [cfg] = await db.select().from(eventPayout).where(eq(eventPayout.eventType, eventType)).limit(1);
    if (!cfg?.enabled || cfg.coins <= 0) return false;
    const res = await db
      .insert(walletLedger)
      .values({
        userId, direction: "credit", eventType,
        sourceType: source.type, sourceId: source.id, coins: cfg.coins, memo,
      })
      .onConflictDoNothing({ target: [walletLedger.sourceType, walletLedger.sourceId, walletLedger.eventType] })
      .returning({ id: walletLedger.id });
    return res.length > 0;
  }
}

export const walletService = new WalletService();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test wallet.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/wallet.service.ts apps/web/lib/services/__tests__/wallet.service.test.ts
git commit -m "feat(wallet): balance + idempotent award"
```

---

### Task 3: `activeRate` + `redeem` (spend as order discount)

**Files:**
- Modify: `apps/web/lib/services/wallet.service.ts`
- Test: `apps/web/lib/services/__tests__/wallet.service.test.ts` (extend)

**Interfaces:**
- Consumes: `walletService.balance`; existing order ledger `discount` write path (`ledgerEntries`, type `discount`).
- Produces:
  - `activeRate(currency: string): Promise<number>` — latest `coin_rate.valuePerCoin` for currency.
  - `redeem(userId, coins, order: {id: bigint; total: number; currency: string}): Promise<{coinsSpent: number; currencyValue: number}>`.

- [ ] **Step 1: Write the failing test** (extend the suite)

Add to `wallet.service.test.ts`:
```ts
describe("WalletService redeem", () => {
  it("converts coins to a capped discount and debits the wallet", async () => {
    // seed: rate 1 coin = 0.10 CAD; user has 50 coins (from earn test)
    await db.insert(coinRate).values({ currency: "CAD", valuePerCoin: "0.1000" });
    const order = { id: orderId, total: 3, currency: "CAD" };  // total 3 CAD
    const r = await walletService.redeem(userId, 50, order);   // 50*0.1 = 5 CAD, capped at 3
    expect(r.currencyValue).toBe(3);
    expect(r.coinsSpent).toBe(30);                              // 3 / 0.1
    expect(await walletService.balance(userId)).toBe(20);
  });

  it("rejects redeeming more than balance", async () => {
    await expect(walletService.redeem(userId, 9999, { id: orderId, total: 100, currency: "CAD" }))
      .rejects.toThrow();
  });
});
```
> Add `coinRate`, `orders` imports and an `orderId` fixture (insert a minimal order in `beforeAll`, clean in `afterAll`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test wallet.service`
Expected: FAIL — `redeem`/`activeRate` undefined.

- [ ] **Step 3: Implement**

Add to `WalletService`:
```ts
  async activeRate(currency: string): Promise<number> {
    const [row] = await db
      .select({ v: coinRate.valuePerCoin })
      .from(coinRate)
      .where(eq(coinRate.currency, currency))
      .orderBy(desc(coinRate.createdAt))
      .limit(1);
    if (!row) throw new ValidationError(`No coin rate for ${currency}`);
    return Number(row.v);
  }

  async redeem(
    userId: bigint,
    coins: number,
    order: { id: bigint; total: number; currency: string },
  ): Promise<{ coinsSpent: number; currencyValue: number }> {
    if (coins <= 0) throw new ValidationError("coins must be positive");
    if (coins > (await this.balance(userId))) throw new ValidationError("insufficient coins");
    const rate = await this.activeRate(order.currency);
    let currencyValue = Math.min(coins * rate, order.total);
    const coinsSpent = Math.round(currencyValue / rate);
    currencyValue = Number((coinsSpent * rate).toFixed(2));
    return db.transaction(async (tx) => {
      await tx.insert(walletLedger).values({
        userId, direction: "debit", sourceType: "redemption",
        sourceId: order.id.toString(), coins: coinsSpent, orderId: order.id, memo: "checkout redemption",
      });
      await tx.insert(ledgerEntries).values({
        userId, orderId: order.id, direction: "debit", type: "discount",
        amount: currencyValue.toFixed(2), memo: "coin redemption",
      });
      return { coinsSpent, currencyValue };
    });
  }
```
Add imports: `desc` from `drizzle-orm`; `coinRate` from `@/db/schema`; `ledgerEntries` from `@/db/schema`; `ValidationError` from `@tiffin/commons`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test wallet.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/wallet.service.ts apps/web/lib/services/__tests__/wallet.service.test.ts
git commit -m "feat(wallet): redeem coins as capped order discount"
```

---

### Task 4: Admin settings — payout grid + coin-rate editor

**Files:**
- Create: settings page + actions under `apps/web/app/(dashboard)/dashboard/settings/wallet/` (follow the structure of the discount-coupons settings, `2026-06-27-discount-coupons-settings-design.md`)
- Create: `apps/web/db/seed-wallet.ts` (seed one `event_payout` row per `business_event`, all disabled/0; one default `coin_rate` for CAD)

**Interfaces:**
- Consumes: `eventPayout`, `coinRate` tables.
- Produces: admin can toggle `enabled` + set `coins` per event, and set the CAD `valuePerCoin`.

- [ ] **Step 1: Seed the payout rows + default rate**

Create `apps/web/db/seed-wallet.ts`:
```ts
import { db } from "@/db/client";
import { businessEvent, coinRate, eventPayout } from "@/db/schema";

for (const ev of businessEvent.enumValues) {
  await db.insert(eventPayout).values({ eventType: ev, enabled: false, coins: 0 })
    .onConflictDoNothing({ target: eventPayout.eventType });
}
await db.insert(coinRate).values({ currency: "CAD", valuePerCoin: "0.1000" });
console.log("wallet seeded");
```
Add script to `apps/web/package.json`: `"db:seed:wallet": "tsx db/seed-wallet.ts"`. Run: `pnpm --filter web db:seed:wallet`.

- [ ] **Step 2: Build the payout grid (typed controls)**

Add a settings page listing each `event_payout` row with a toggle (`enabled`) and a number input (`coins`), saving via a server action that updates `eventPayout` by `eventType`. Reuse the existing settings table/card components and the typed-controls convention (no free-text for the event — it's a fixed enum row). Mirror the discount-coupons settings page layout.

- [ ] **Step 3: Build the coin-rate editor**

Add a currency + `valuePerCoin` number field; saving **inserts a new `coin_rate` row** (versioned, not an update) via a server action.

- [ ] **Step 4: Verify in the app**

Run the app (`/run`), open the wallet settings page, enable `order_activated` with 50 coins, set CAD rate, save. Confirm rows in `event_payout` / `coin_rate`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/(dashboard)/dashboard/settings/wallet apps/web/db/seed-wallet.ts apps/web/package.json
git commit -m "feat(wallet): admin payout grid + coin-rate editor"
```

---

### Task 5: Fire `award` on order activation

**Files:**
- Modify: the order-activation code path (locate via `rg "order_activated\|status.*active\|activate" apps/web/lib/services apps/web/app` — the order status→active transition).

**Interfaces:**
- Consumes: `walletService.award`.

- [ ] **Step 1: Locate the activation transition**

Find where an order moves to `active` (order service status change / activation action). This is the single call site.

- [ ] **Step 2: Call `award` after activation succeeds**

After the order is persisted as active:
```ts
import { walletService } from "@/lib/services/wallet.service";
// order.userId is the customer's internal bigint; order.publicId the source id
await walletService.award(order.userId, "order_activated", { type: "order", id: order.publicId });
```
Idempotency is guaranteed by the unique index, so a re-activation or retry never double-pays.

- [ ] **Step 3: Verify**

Activate a test order in the app; confirm a `credit` row in `wallet_ledger` and the balance reflects the configured payout. Activate again (or retry) → still one credit.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/services apps/web/app
git commit -m "feat(wallet): award coins on order activation"
```

---

## Self-Review

- **Spec coverage:** schema + shared enum (Task 1) ✓; balance + idempotent earn (Task 2) ✓; spend-as-discount + rate (Task 3) ✓; admin payout/rate config (Task 4) ✓; earn trigger wiring (Task 5) ✓. Deferred `referral_converted`/`signup` correctly excluded from the enum.
- **Placeholder scan:** Tasks 4–5 contain locate-then-edit steps (settings layout reuse, activation call site) with concrete code/snippets and named reference designs — no bare TODOs. Live-DB test fixtures note the minimal-columns fill-in (schema-dependent), not a logic gap.
- **Type consistency:** `BusinessEvent` derived from `walletLedger.eventType.enumValues`; `award`/`redeem`/`balance`/`activeRate` signatures identical between the Interfaces blocks, the implementation, and the test call sites. `redeem` order arg `{id,total,currency}` consistent across Task 3.
