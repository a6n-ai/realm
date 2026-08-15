# `@realm/wallet` Extraction — Implementation Plan (Slice 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move tiffin-grab's wallet schema and service into a shared, server-only `@realm/wallet` package, with tiffin-grab's behaviour and database schema byte-identical afterwards.

**Architecture:** The tables FK to app-local `users` and `orders` and use a per-app `app_event` enum, so they ship as a factory — exactly the shape `@realm/notifications` already uses for the same reason. The service takes its `db` handle, its tables, and its one app-specific write (the money `ledger_entries` discount row) as injected dependencies, so the package never imports an app. No UI moves.

**Tech Stack:** Drizzle ORM on Postgres, TypeScript project references (packages ship raw `.ts`, no build step), Vitest with live-DB integration tests.

**Spec:** `docs/superpowers/specs/2026-08-14-puchkaman-customer-accounts-design.md` (Slice 3, revised 2026-08-14)

## Global Constraints

- Work in `/Users/lawbringr/IdeaProjects/realm-wt-3c88e511` on branch `wt/3c88e511`. Never the shared checkout.
- `docs/` is gitignored (`.gitignore:63`); doc commits need `git add -f`.
- **This refactors money code that is live in production for tiffin-grab.** Behaviour must be identical. Every existing wallet test passes *unchanged* — if a test needs editing to pass, that is a defect in the refactor, not the test. The one exception is an import path moving.
- Verify after each task: `pnpm turbo typecheck && pnpm --filter tiffin-grab test`. Note this is the WHOLE-REPO typecheck, not `--filter`, because a package change can break any consumer.
- `@realm/wallet` is **server-only**: it must NOT be added to `transpilePackages` in either app, matching `@realm/auth`.
- Packages ship raw `.ts` — no build step, no `dist`. Copy the tsconfig of an existing server-only package verbatim.
- Never rewrite an applied migration. **This slice should produce NO new migration at all** — that is the acceptance proof.
- `psql` at `/Applications/Postgres.app/Contents/Versions/latest/bin/psql`, DB `postgres://localhost:5432/tiffin`.
- Comment the non-obvious *why* only. `rg`/`fd` over `grep`/`find`.

## Invariants that must survive verbatim

Copied from the current implementation; every task is checked against this list.

1. `uniqueIndex("wallet_earn_idempotent_idx").on(sourceType, sourceId, eventType)` — makes `award` idempotent.
2. `index("wallet_user_created_idx").on(userId, createdAt)` and `index("coin_rate_currency_created_idx").on(currency, createdAt)`.
3. `award` no-ops (returns `false`) when the payout row is missing, disabled, or `coins <= 0`.
4. `redeem` takes a `SELECT id FROM users WHERE id = … FOR UPDATE` row lock, then re-reads the balance INSIDE the transaction — the TOCTOU guard.
5. `redeem` caps `currencyValue` at `order.total` **twice**: once before rounding, once after recomputing from `coinsSpent`, because a non-round rate can push the recomputed value back over the cap.
6. `redeem` refuses a second redemption for the same order (`sourceType: "redemption"`, `sourceId: order.id`).
7. `redeem` writes BOTH the `wallet_ledger` debit AND the app's `ledger_entries` discount row, in one transaction.
8. `moneyValue` returns `null` rather than throwing when a currency has no rate — the wallet renders coins-only instead of 500ing.
9. `ledgerPage` ANDs the `userId` scope with the facet condition so a facet cannot widen past the caller's own rows.

---

### Task 1: Scaffold the package and the schema factory

**Files:**
- Create: `packages/wallet/package.json`, `packages/wallet/tsconfig.json`
- Create: `packages/wallet/src/schema.ts`, `packages/wallet/src/index.ts`
- Create: `packages/wallet/src/__tests__/schema.test.ts`

**Interfaces:**
- Produces: `makeWalletTables(deps)` returning `{ walletLedger, eventPayout, coinRate }`, and `type WalletTables = ReturnType<typeof makeWalletTables>`, exported from `packages/wallet/src/schema.ts` and re-exported from `src/index.ts`.
- Task 2 consumes `WalletTables`; Task 3 calls `makeWalletTables`.

- [ ] **Step 1: Read the precedent before writing anything**

`packages/notifications/src/schema.ts` exports `makeNotificationTables({ users, appEvent, locale, campaign? })` and solves this identical problem — app-local FKs plus a per-app enum. Read it in full, along with `packages/notifications/package.json` and `packages/notifications/tsconfig.json`. **Mirror its generics, its dependency-object shape, and its docblock style.** Do not invent a different signature.

Also read `apps/tiffin-grab/db/schema/wallet.ts` — the tables you are about to parameterise.

- [ ] **Step 2: Create the package manifest**

`packages/wallet/package.json`. Model it on `packages/notifications/package.json`, but server-only (no React/Next peer deps unless the precedent needs them):

```json
{
  "name": "@realm/wallet",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema.ts"
  },
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@realm/commons": "workspace:*",
    "@realm/database": "workspace:*"
  },
  "peerDependencies": {
    "drizzle-orm": "^0.45.2"
  },
  "devDependencies": {
    "drizzle-orm": "^0.45.2",
    "typescript": "*",
    "vitest": "*"
  }
}
```

Match the exact dependency version strings used by the sibling packages rather than these — read one and copy. `packages/wallet/tsconfig.json` is the one-line extends used by every server-only package; copy `packages/coupons/tsconfig.json` (no DOM/jsx).

- [ ] **Step 3: Write the failing test**

Create `packages/wallet/src/__tests__/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bigint, pgEnum, pgTable } from "drizzle-orm/pg-core";
import { getTableConfig } from "drizzle-orm/pg-core";
import { makeWalletTables } from "../schema";

const appEvent = pgEnum("app_event", ["order_paid", "signup"]);
const ledgerDirection = pgEnum("ledger_direction", ["debit", "credit"]);
const users = pgTable("users", { id: bigint("id", { mode: "bigint" }).primaryKey() });
const orders = pgTable("orders", { id: bigint("id", { mode: "bigint" }).primaryKey() });

const tables = makeWalletTables({ users, orders, appEvent, ledgerDirection });

describe("makeWalletTables", () => {
  it("names the tables exactly as the existing schema does", () => {
    expect(getTableConfig(tables.walletLedger).name).toBe("wallet_ledger");
    expect(getTableConfig(tables.eventPayout).name).toBe("event_payout");
    expect(getTableConfig(tables.coinRate).name).toBe("coin_rate");
  });

  it("keeps the idempotency index that makes award safe to retry", () => {
    const idx = getTableConfig(tables.walletLedger).indexes.find(
      (i) => i.config.name === "wallet_earn_idempotent_idx",
    );
    expect(idx).toBeDefined();
    expect(idx!.config.unique).toBe(true);
    expect(idx!.config.columns.map((c) => (c as { name: string }).name)).toEqual([
      "source_type",
      "source_id",
      "event_type",
    ]);
  });

  it("keeps both lookup indexes", () => {
    const walletIdx = getTableConfig(tables.walletLedger).indexes.map((i) => i.config.name);
    expect(walletIdx).toContain("wallet_user_created_idx");
    const rateIdx = getTableConfig(tables.coinRate).indexes.map((i) => i.config.name);
    expect(rateIdx).toContain("coin_rate_currency_created_idx");
  });

  it("keeps event_payout.event_type unique — one payout row per event", () => {
    const cols = getTableConfig(tables.eventPayout).columns;
    const eventType = cols.find((c) => c.name === "event_type");
    expect(eventType?.isUnique).toBe(true);
  });

  it("allows a null event_type on the ledger — spends carry no event", () => {
    const cols = getTableConfig(tables.walletLedger).columns;
    expect(cols.find((c) => c.name === "event_type")?.notNull).toBe(false);
    expect(cols.find((c) => c.name === "user_id")?.notNull).toBe(true);
  });
});
```

If `getTableConfig`'s shape differs from what these assertions assume, adapt the accessors — but do not weaken what is being asserted. Each assertion pins one of the invariants listed at the top of this plan.

- [ ] **Step 4: Run it and watch it fail**

Run: `cd packages/wallet && pnpm vitest run`
Expected: FAIL — `../schema` does not exist.

- [ ] **Step 5: Write the factory**

Create `packages/wallet/src/schema.ts`. Port `apps/tiffin-grab/db/schema/wallet.ts` verbatim, changing ONLY what parameterisation requires: `users`, `orders`, `appEvent`, and `ledgerDirection` arrive via the deps object instead of being imported. Keep every column name, type, default, nullability, and index name **exactly** as they are today — the acceptance proof in Task 3 is that drizzle-kit generates no migration.

Do NOT move `appEvent` itself: it is the app-wide event catalog (tiffin-grab's `notifications.ts` imports it) and each app has its own value set. It is a parameter, never a package export.

Follow `makeNotificationTables` for how to type the deps object and how to constrain the enum generic.

Create `packages/wallet/src/index.ts` re-exporting from `./schema`.

- [ ] **Step 6: Run it and watch it pass**

Run: `cd packages/wallet && pnpm vitest run`
Expected: PASS, 5 tests.

- [ ] **Step 7: Wire the workspace and typecheck the repo**

Run: `pnpm install` from the worktree root so the new workspace package resolves.
Run: `pnpm turbo typecheck`
Expected: PASS across all packages and apps.

- [ ] **Step 8: Commit**

```bash
git add packages/wallet
git commit -m "feat(wallet): @realm/wallet package with a wallet table factory"
```

---

### Task 2: Move the service into the package

**Files:**
- Create: `packages/wallet/src/service.ts`
- Modify: `packages/wallet/src/index.ts`
- Create: `packages/wallet/src/__tests__/redeem-math.test.ts`

**Interfaces:**
- Consumes: `WalletTables` (Task 1).
- Produces: `createWalletService(deps: WalletDeps)` returning an object with `balance`, `ledgerPage`, `award`, `recentTransactions`, `earnSpendTotals`, `moneyValue`, `activeRate`, `redeem`; plus exported types `WalletTx`, `WalletDeps`, and `capRedemption`.
- Task 4 calls `createWalletService`.

Three things are app-specific and must be injected rather than imported:
- the `db` handle (`@realm/database` exports `type Database` for exactly this),
- the `orders` table, joined for `orderPublicId`,
- the `ledger_entries` discount write in `redeem` — that table's shape differs per app, so the package takes a callback and never names it.

The `FOR UPDATE` lock currently hardcodes the string `users`. Interpolate the injected `users` table into the `sql` template instead, so the package makes no assumption about the table's name.

- [ ] **Step 1: Write the failing test for the rounding rule**

The double-cap in `redeem` is the subtlest logic in the file and is currently only reachable through a live-DB test. Extract it as a pure function so it can be pinned directly.

Create `packages/wallet/src/__tests__/redeem-math.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { capRedemption } from "../service";

/**
 * A non-round rate makes coinsSpent * rate exceed the order total after
 * rounding, which is why the cap is applied twice. These cases fail if the
 * second cap is ever dropped as redundant.
 */
describe("capRedemption", () => {
  it("spends every coin when the value is under the order total", () => {
    expect(capRedemption(100, 0.05, 50)).toEqual({ coinsSpent: 100, currencyValue: 5 });
  });

  it("caps at the order total when the coins are worth more", () => {
    const out = capRedemption(1000, 0.05, 10);
    expect(out.currencyValue).toBeLessThanOrEqual(10);
  });

  it("re-caps after rounding, so a non-round rate cannot exceed the total", () => {
    const total = 10;
    const out = capRedemption(999, 0.03, total);
    expect(out.currencyValue).toBeLessThanOrEqual(total);
  });

  it("never returns a negative or fractional coin count", () => {
    const out = capRedemption(7, 0.03, 100);
    expect(Number.isInteger(out.coinsSpent)).toBe(true);
    expect(out.coinsSpent).toBeGreaterThanOrEqual(0);
  });

  it("rounds currency to two decimals", () => {
    const out = capRedemption(33, 0.07, 100);
    expect(out.currencyValue).toBe(Number(out.currencyValue.toFixed(2)));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/wallet && pnpm vitest run src/__tests__/redeem-math.test.ts`
Expected: FAIL — `capRedemption` is not exported.

- [ ] **Step 3: Write the service**

Create `packages/wallet/src/service.ts`. Port `apps/tiffin-grab/lib/services/wallet.service.ts` **method for method, SQL expression for SQL expression**. The only permitted changes:

- `db`, tables, `users`, `orders` and the discount writer come from `deps` instead of module imports.
- The class becomes a factory function `createWalletService(deps)` returning the same eight methods. (A class is fine too if it takes deps in its constructor — match whichever shape the sibling packages use.)
- `BusinessEvent` becomes generic over the injected enum's values rather than being derived from a hardcoded import.
- The double-cap arithmetic moves into an exported `capRedemption(coins, rate, orderTotal)` returning `{ coinsSpent, currencyValue }`, called from `redeem`.

Preserve the existing comments explaining WHY — the TOCTOU note, the `ponytail:` lock note, the re-cap note, and the `moneyValue` degrade-to-null note. They document decisions, not mechanics.

The deps shape:

```ts
export type WalletDeps<E extends string> = {
  db: Database;
  tables: WalletTables;
  /** Joined for orderPublicId; app-local, so injected. */
  orders: PgTableWithColumns<any>;
  /** Locked FOR UPDATE to serialise redemptions. */
  users: PgTableWithColumns<any>;
  /**
   * Writes the app's own money-ledger discount row inside redeem's transaction.
   * Injected because ledger_entries differs per app and the package must not
   * name an app-local table.
   */
  recordRedemptionDiscount: (
    tx: unknown,
    args: { userId: bigint; orderId: bigint; amount: string; memo: string },
  ) => Promise<void>;
};
```

Type `tx` as precisely as the drizzle version allows rather than leaving `unknown` if you can — check how other packages type a transaction handle.

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/wallet && pnpm vitest run`
Expected: PASS, 10 tests (5 schema + 5 redeem-math).

- [ ] **Step 5: Export and typecheck**

Re-export the service from `packages/wallet/src/index.ts`.

Run: `pnpm turbo typecheck`
Expected: PASS. Nothing consumes the service yet, so this only proves the package compiles standalone.

- [ ] **Step 6: Commit**

```bash
git add packages/wallet
git commit -m "feat(wallet): wallet service with injected db, tables and ledger writer"
```

---

### Task 3: Point tiffin-grab's schema at the factory — with zero migration drift

**Files:**
- Modify: `apps/tiffin-grab/db/schema/wallet.ts`

**Interfaces:**
- Consumes: `makeWalletTables` (Task 1).
- Produces: the same `walletLedger`, `eventPayout`, `coinRate`, `appEvent` exports as today, so every existing importer keeps working untouched.

**This is the highest-risk task in the slice.** The acceptance proof is that drizzle-kit generates NO migration — meaning the factory produces a schema byte-identical to what production already has.

- [ ] **Step 1: Record the pre-change state**

```bash
cd /Users/lawbringr/IdeaProjects/realm-wt-3c88e511
ls apps/tiffin-grab/db/migrations | tail -3
git rev-parse --short HEAD
```
Note the latest migration filename. Nothing new may appear.

- [ ] **Step 2: Rewrite the schema file as a factory call**

`apps/tiffin-grab/db/schema/wallet.ts` becomes:

```ts
import { makeWalletTables } from "@realm/wallet/schema";
import { pgEnum } from "drizzle-orm/pg-core";
import { ledgerDirection } from "./coupons";
import { orders } from "./orders";
import { users } from "./auth";

// Unified app-wide event catalog. Wallet payouts (event_payout) AND notification
// templates key off this single enum. An event need not have a payout or a
// template — each subsystem uses the subset that applies. It stays app-local:
// puchkaman has its own value set under the same Postgres type name, which is
// why the wallet tables come from a factory rather than being shared directly.
export const appEvent = pgEnum("app_event", [
  "order_created", "order_activated", "order_completed", "order_cancelled", "order_paused",
  "payment_received", "refund_issued",
  "menu_released",
  "wallet_credited", "wallet_redeemed",
  "inquiry_created", "inquiry_follow_up", "inquiry_converted",
  "ticket_created", "ticket_reply", "ticket_resolved",
  "signup", "manual_adjustment",
]);

export const { walletLedger, eventPayout, coinRate } = makeWalletTables({
  users,
  orders,
  appEvent,
  ledgerDirection,
});
```

Keep the enum's values in exactly this order — reordering a pgEnum is a schema change.

- [ ] **Step 3: Prove zero drift — the acceptance gate**

Run: `pnpm --filter tiffin-grab db:generate`

**Expected: drizzle-kit reports no schema changes and writes NO new migration file.**

If it writes one, open it. Any statement at all means the factory is not reproducing the current schema — a renamed index, a changed default, a dropped constraint, a column order difference that drizzle treats as significant. **Delete the generated file, fix the factory, and re-run.** Do not "accept" a migration here; the whole point of this task is that there is nothing to migrate.

Confirm afterwards:
```bash
git status --short apps/tiffin-grab/db/migrations
```
Expected: empty.

- [ ] **Step 4: Confirm the schema barrel and every importer still resolve**

Run: `pnpm turbo typecheck`
Expected: PASS. `db/schema/index.ts` re-exports this file, and `db/schema/notifications.ts` imports `appEvent` from it — both must still work.

- [ ] **Step 5: Run tiffin-grab's full suite**

Run: `pnpm --filter tiffin-grab test`
Expected: PASS, with every wallet test unchanged. The live-DB tests run against the real tables, so this also proves the factory's tables map onto the existing database.

- [ ] **Step 6: Commit**

```bash
git add apps/tiffin-grab/db/schema/wallet.ts
git commit -m "refactor(tiffin-grab): build wallet tables from the shared factory"
```

---

### Task 4: Point tiffin-grab's service at the package

**Files:**
- Modify: `apps/tiffin-grab/lib/services/wallet.service.ts`

**Interfaces:**
- Consumes: `createWalletService` (Task 2).
- Produces: the same `walletService` singleton and the same `WalletTx` / `BusinessEvent` types, so `orders.service.ts`, the customer layout, `/me/wallet`, and the tests all keep importing exactly what they import today.

The file shrinks to a wiring module: build the deps, call the factory, re-export the types.

- [ ] **Step 1: Rewrite as wiring**

`apps/tiffin-grab/lib/services/wallet.service.ts` becomes roughly:

```ts
import { createWalletService } from "@realm/wallet";
import { db } from "@/db/client";
import { coinRate, eventPayout, ledgerEntries, orders, users, walletLedger } from "@/db/schema";

export type BusinessEvent = (typeof walletLedger.eventType.enumValues)[number];
export type { WalletTx } from "@realm/wallet";

export const walletService = createWalletService<BusinessEvent>({
  db,
  tables: { walletLedger, eventPayout, coinRate },
  orders,
  users,
  // The app's own money ledger. Kept here rather than in the package because
  // ledger_entries is app-local and its columns differ between apps.
  recordRedemptionDiscount: async (tx, { userId, orderId, amount, memo }) =>
    void (await (tx as typeof db).insert(ledgerEntries).values({
      userId,
      orderId,
      direction: "debit",
      type: "discount",
      amount,
      memo,
    })),
});
```

Adjust to whatever the real factory signature turned out to be. **`WalletTx` must remain a named export of this module** — `components/customer/home/wallet-section.tsx` and the tests import it from here, and this is exactly the "client symbol demoted from a named export" trap that `tsc` catches only sometimes.

- [ ] **Step 2: Run the wallet tests unchanged**

Run: `cd apps/tiffin-grab && pnpm vitest run lib/services/__tests__/wallet.service.test.ts lib/services/__tests__/wallet-activation.test.ts lib/services/__tests__/wallet-ledger-page.test.ts lib/services/__tests__/wallet-recent-transactions.test.ts lib/services/__tests__/wallet-totals.test.ts`

Expected: PASS, with **no edits to any of those five files**. If one fails, the refactor changed behaviour — fix the service, not the test. If one needs an import path changed, that is acceptable and must be called out in your report; anything more is a defect.

- [ ] **Step 3: Run the full app suite**

Run: `pnpm --filter tiffin-grab test`
Expected: PASS. This also covers `payment-deferral`, `payment-e2e-lifecycle` (both delete `wallet_ledger` in their reset), and the `home-guard` test that mocks this module's path.

- [ ] **Step 4: Confirm the package stayed out of the browser**

`@realm/wallet` is server-only and must NOT be in `transpilePackages`.

Run: `rg -n 'wallet' apps/tiffin-grab/next.config.ts`
Expected: no match.

Run: `pnpm --filter tiffin-grab build`
Expected: SUCCESS. If the build complains about the package in a client boundary, something imported the service from a client component — find it rather than adding the package to `transpilePackages`.

- [ ] **Step 5: Whole-repo verify**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS. Note the pre-existing repo state: several packages have no test files and `turbo test` reports failures for them — compare against the same command on the previous commit rather than assuming a new break.

- [ ] **Step 6: Commit**

```bash
git add apps/tiffin-grab/lib/services/wallet.service.ts
git commit -m "refactor(tiffin-grab): wallet service moves to @realm/wallet"
```

---

### Task 5: Prove the database never changed

**Files:** none — verification only.

The whole slice claims to be behaviour- and schema-identical. This task tries to falsify that.

- [ ] **Step 1: No migration was added**

```bash
git diff --stat main..HEAD -- apps/tiffin-grab/db/migrations
```
Expected: empty. If anything appears, stop and report — the refactor changed the schema.

- [ ] **Step 2: The live database still matches the schema**

Run: `pnpm --filter tiffin-grab db:generate`
Expected: no changes detected, no file written. Confirm with `git status --short`.

- [ ] **Step 3: Compare the live tables against the invariants**

```bash
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"
psql "postgres://localhost:5432/tiffin" -c "\d wallet_ledger"
psql "postgres://localhost:5432/tiffin" -c "\d event_payout"
psql "postgres://localhost:5432/tiffin" -c "\d coin_rate"
```

Check against the invariant list at the top of this plan: `wallet_earn_idempotent_idx` present and UNIQUE on `(source_type, source_id, event_type)`; `wallet_user_created_idx` present; `coin_rate_currency_created_idx` present; `event_type` unique on `event_payout`; `event_type` nullable on `wallet_ledger`. Paste the output into your report.

- [ ] **Step 4: Report**

State plainly whether the schema is unchanged, whether all five wallet test files are byte-identical to their pre-slice versions (`git diff main..HEAD -- apps/tiffin-grab/lib/services/__tests__/`), and anything you had to touch beyond the four files this plan names.

---

## Self-Review

**Spec coverage.** Schema factory (Task 1), service with injected deps (Task 2), tiffin-grab migration (Tasks 3-4), zero-drift proof (Tasks 3 and 5). The revised spec's exclusions are honoured: no UI moves, `appEvent` stays app-local, the package is server-only and absent from `transpilePackages`, and the `ledger_entries` write is injected.

**Placeholders.** Task 1 Step 1 and Task 2 Step 3 are read-then-mirror steps rather than literal code, deliberately: `makeNotificationTables` already solves this exact problem in this repo, and guessing generics that a working precedent defines is how the previous slices produced four wrong imports. Task 2's deps block is illustrative and explicitly says to adjust to the real signature.

**Type consistency.** `WalletTables` is produced in Task 1 and consumed in Task 2. `createWalletService` / `WalletDeps` / `capRedemption` match between Task 2's tests and its implementation. Task 4 re-exports `WalletTx` and `BusinessEvent` under their existing names so no consumer changes.

**Biggest risk.** Task 3's zero-drift gate. If the factory produces even a slightly different schema, drizzle-kit will offer a migration against a production table — the plan's instruction is to delete it and fix the factory, never to accept it.
