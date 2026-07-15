# Customer Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real `/me/wallet` — coin balance + money-value hero, earn/spend totals, and a full FacetFilters + ListPagination coins log; home `WalletSection` becomes a compact peek linking to it.

**Architecture:** New user-scoped reads on `walletService` (paginated ledger via the unified list framework, earn/spend aggregate, money-value wrapper). A new `/me/wallet` route wires `parseFilterState` → `ledgerPage`, rendering new wallet components (reusing Slice-0 `AnimatedNumber`/coin-burst `Lottie`). No DB schema change.

**Tech Stack:** Next.js 16, React 19, Drizzle, Vitest (live-DB + jsdom), the unified list framework (`FacetDef`/`parseFilterState`/`FacetFilters`/`ListPagination` from `@realm/design-system`, `conditionToSql`/`columnResolver` from `@realm/database`), Slice-0 `@/components/motion`.

## Global Constraints

- All in `apps/tiffin-grab`. **No DB schema change.** No new routes beyond `/me/wallet`.
- **IDOR is load-bearing:** the ledger read's filter condition is user-supplied (facets). The read MUST `and(eq(walletLedger.userId, userId), conditionToSql(condition, resolver))` where `userId` comes from the session, NOT the condition, and the resolver maps ONLY facet fields (direction/eventType/createdAt/memo) — never `userId`. Both the rows query and the count query carry the userId scope.
- **`activeRate` throws when no `coin_rate` row exists** → `moneyValue` MUST catch and return `null`; the wallet page must never 500 for a currency with no rate (show coins, hide money).
- Coins vs money stay distinct: the log + totals are COINS (`wallet_ledger`); money is a display-only `coins × activeRate` on the hero. No spend authorization is computed client-side.
- List-framework gotchas: don't name the read `list`; facet field names must match resolver columns; single-table so no FK subqueries needed.
- `"use client"` on client components; `cn` from `@realm/ui/cn`; reduced-motion honored. `*Skeleton` twins are top-level named exports.
- Verify gate after each task: `pnpm --filter tiffin-grab exec tsc --noEmit` + the task test. Final task: `pnpm turbo typecheck && pnpm turbo test`.
- Worktree `/Users/lawbringr/IdeaProjects/realm-wt-2f09d8c4`, branch `wt/slice3-wallet`. node_modules installed. Local Postgres reachable.

## Reuse reference (exact)

- `WalletTx` (`lib/services/wallet.service.ts`) = `{ publicId; direction: "credit"|"debit"; coins; eventType: BusinessEvent|null; sourceType; sourceId; memo: string|null; createdAt: number; orderPublicId: string|null }`.
- `walletService` methods today: `balance(userId): Promise<number>`, `recentTransactions(userId, limit=10)`, `award`, `redeem`, `activeRate(currency): Promise<number>` (throws `ValidationError` if no rate). Singleton `export const walletService`.
- `wallet_ledger` cols: `userId`, `direction` (credit/debit), `eventType` (nullable), `sourceType`, `sourceId`, `coins` (positive int), `memo`, `orderId` (nullable FK) + `baseColumns("wlt")` (id/publicId/createdAt/createdBy). Index `(userId, createdAt)`.
- `eventLabel(event: string): string` (`components/notifications/template-status.tsx`) — snake→"Title case".
- Paginated-read pattern (mirror `listOrdersPage`, `lib/services/orders.service.ts:402`):
  ```ts
  const where = conditionToSql(condition, columnResolver({ status: orders.status, ... }));
  const rows = await db.select({...}).from(orders)...where(where).orderBy(desc(col)).limit(page.size).offset(page.page * page.size);
  const [{ count }] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(orders).where(where);
  return { items, page: page.page, size: page.size, total: count };
  ```
  Types: `Condition` from `@realm/commons/model/condition`, `PageRequest`/`Page` from `@realm/commons/util/pagination`, `conditionToSql`/`columnResolver` from `@realm/database`.
- Framework: `parseFilterState(spec: FacetDef[], sp, opts?): { condition, page, q }`; `FacetDef` kinds `pills|select|multi|dateRange|search`; `<FacetFilters spec={spec}/>`; `<ListPagination page size total/>`. Confirm the import barrel by mirroring `app/(dashboard)/dashboard/orders/page.tsx` + `orders-list.tsx`.

## Live-DB seed reference

Direct `wallet_ledger` inserts (mirror the Slice-4 `reset()`; scope cleanup to a test user). `makeUser` via the Slice-4 harness (`makeOrder` provisions a user), or insert a `users` row directly. Insert ledger rows:
```ts
await db.insert(walletLedger).values({ userId, direction: "credit", eventType: "signup", sourceType: "signup", sourceId: "s1", coins: 50, memo: null });
await db.insert(walletLedger).values({ userId, direction: "debit", eventType: null, sourceType: "redeem", sourceId: "r1", coins: 30, memo: null });
```
For `moneyValue` no-rate test: ensure the test currency has no `coin_rate` row (or delete coin_rate for it) and assert `null`.

## File Structure

- `lib/services/wallet.service.ts` — add `ledgerPage`, `earnSpendTotals`, `moneyValue`.
- `app/(customer)/me/wallet/page.tsx` — route + loader (NEW).
- `components/customer/wallet/wallet-hero.tsx`, `earn-spend-tiles.tsx`, `wallet-log.tsx`, `wallet-facets.ts` (NEW).
- `components/customer/home/wallet-section.tsx` — compact peek + link.
- `components/customer/customer-bottom-nav.tsx` + `customer-sidebar.tsx` — Wallet nav entry.
- Tests colocated.

---

### Task 1: `walletService.ledgerPage` (paginated, user-scoped)

**Files:**
- Modify: `apps/tiffin-grab/lib/services/wallet.service.ts`
- Test: `apps/tiffin-grab/lib/services/__tests__/wallet-ledger-page.test.ts`

**Interfaces:**
- Produces: `ledgerPage(userId: bigint, condition: Condition | undefined, page: PageRequest): Promise<Page<WalletTx>>` — user-scoped, facet-filterable, `createdAt desc`.

- [ ] **Step 1: Read** `lib/services/orders.service.ts:402` (`listOrdersPage`) for the exact `conditionToSql`/`columnResolver`/count pattern, and the top of `wallet.service.ts` for existing imports (`walletLedger`, `orders`, `db`, `WalletTx`).

- [ ] **Step 2: Write the failing test**

Create `apps/tiffin-grab/lib/services/__tests__/wallet-ledger-page.test.ts` (live-DB, seed reference above). Seed user A with 3 credit + 2 debit rows, and user B with 1 row. Then:
```ts
import { eq } from "@realm/commons/model/condition";
const all = await walletService.ledgerPage(userAId, undefined, { page: 0, size: 25 });
expect(all.total).toBe(5);
expect(all.items.every((r) => typeof r.coins === "number")).toBe(true);
// earn filter (direction=credit)
const earned = await walletService.ledgerPage(userAId, eq("direction", "credit"), { page: 0, size: 25 });
expect(earned.total).toBe(3);
// IDOR: user B's rows never appear for user A even with no condition
expect(all.items.every((r) => r.publicId)).toBe(true); // rows are A's only (asserted via total=5, B has 1)
```

- [ ] **Step 3: Run it, verify it fails** — `pnpm exec vitest run lib/services/__tests__/wallet-ledger-page.test.ts` → FAIL (`ledgerPage` not a function).

- [ ] **Step 4: Implement**

Add to `wallet.service.ts` (imports: `conditionToSql, columnResolver` from `@realm/database`; `Condition` from `@realm/commons/model/condition`; `Page, PageRequest` from `@realm/commons/util/pagination`; `and, eq` from drizzle-orm; `sql`):
```ts
async ledgerPage(userId: bigint, condition: Condition | undefined, page: PageRequest): Promise<Page<WalletTx>> {
  const facet = conditionToSql(condition, columnResolver({
    direction: walletLedger.direction,
    eventType: walletLedger.eventType,
    createdAt: walletLedger.createdAt,
    memo: walletLedger.memo,
  }));
  // userId scope is NOT user-controllable — AND it with the facet condition.
  const where = facet ? and(eq(walletLedger.userId, userId), facet) : eq(walletLedger.userId, userId);
  const rows = await db
    .select({
      publicId: walletLedger.publicId, direction: walletLedger.direction, coins: walletLedger.coins,
      eventType: walletLedger.eventType, sourceType: walletLedger.sourceType, sourceId: walletLedger.sourceId,
      memo: walletLedger.memo, createdAt: walletLedger.createdAt, orderPublicId: orders.publicId,
    })
    .from(walletLedger)
    .leftJoin(orders, eq(walletLedger.orderId, orders.id))
    .where(where)
    .orderBy(desc(walletLedger.createdAt))
    .limit(page.size).offset(page.page * page.size);
  const [{ count }] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(walletLedger).where(where);
  return { items: rows.map((r) => ({ ...r, orderPublicId: r.orderPublicId ?? null })), page: page.page, size: page.size, total: count };
}
```
(Confirm `WalletTx` fields match the select; add `desc` to the drizzle import.)

- [ ] **Step 5: Run it, verify it passes** — GREEN. Then `pnpm exec vitest run lib/services/__tests__` (no regression).

- [ ] **Step 6: Typecheck + commit**
```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add lib/services/wallet.service.ts lib/services/__tests__/wallet-ledger-page.test.ts
git commit -m "feat(wallet): user-scoped paginated ledgerPage read"
```

---

### Task 2: `earnSpendTotals` + `moneyValue`

**Files:**
- Modify: `apps/tiffin-grab/lib/services/wallet.service.ts`
- Test: `apps/tiffin-grab/lib/services/__tests__/wallet-totals.test.ts`

**Interfaces:**
- Produces: `earnSpendTotals(userId: bigint): Promise<{ earned: number; spent: number }>` and `moneyValue(coins: number, currency: string): Promise<number | null>`.

- [ ] **Step 1: Write the failing test**

Create `apps/tiffin-grab/lib/services/__tests__/wallet-totals.test.ts` (live-DB). Seed user with credits summing 70 and debits summing 30. Assert:
```ts
const t = await walletService.earnSpendTotals(userId);
expect(t).toEqual({ earned: 70, spent: 30 });
// moneyValue: seed a coin_rate for "CAD" = 0.01, expect 100 coins -> 1.00
expect(await walletService.moneyValue(100, "CAD")).toBeCloseTo(1.0);
// no rate -> null (no throw)
expect(await walletService.moneyValue(100, "ZZZ")).toBeNull();
```

- [ ] **Step 2: Run it, verify it fails** — FAIL (functions missing).

- [ ] **Step 3: Implement**
```ts
async earnSpendTotals(userId: bigint): Promise<{ earned: number; spent: number }> {
  const coinsIf = (dir: "credit" | "debit") =>
    sql<number>`cast(coalesce(sum(case when ${walletLedger.direction} = ${dir} then ${walletLedger.coins} else 0 end), 0) as int)`;
  const [agg] = await db.select({ earned: coinsIf("credit"), spent: coinsIf("debit") })
    .from(walletLedger).where(eq(walletLedger.userId, userId));
  return { earned: agg.earned, spent: agg.spent };
}

// Display-only money value. activeRate throws when a currency has no coin_rate
// row; degrade to null so the wallet renders coins-only instead of 500ing.
async moneyValue(coins: number, currency: string): Promise<number | null> {
  try {
    const rate = await this.activeRate(currency);
    return Number((coins * rate).toFixed(2));
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run it, verify it passes** — GREEN.

- [ ] **Step 5: Typecheck + commit**
```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add lib/services/wallet.service.ts lib/services/__tests__/wallet-totals.test.ts
git commit -m "feat(wallet): earnSpendTotals + moneyValue (degrades when no rate)"
```

---

### Task 3: `<WalletHero>` + `<EarnSpendTiles>`

**Files:**
- Create: `apps/tiffin-grab/components/customer/wallet/wallet-hero.tsx`
- Create: `apps/tiffin-grab/components/customer/wallet/earn-spend-tiles.tsx`
- Test: `apps/tiffin-grab/components/customer/wallet/__tests__/wallet-hero.test.tsx`

**Interfaces:**
- Consumes: `AnimatedNumber`, `Lottie` from `@/components/motion`.
- Produces: `WalletHero({ coins, money }: { coins: number; money: number | null })`; `EarnSpendTiles({ earned, spent }: { earned: number; spent: number })`.

- [ ] **Step 1: Write the failing test**

Create `apps/tiffin-grab/components/customer/wallet/__tests__/wallet-hero.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/motion", () => ({
  AnimatedNumber: ({ value, format }: { value: number; format?: (n: number) => string }) => <span>{format ? format(value) : String(value)}</span>,
  Lottie: () => <div data-testid="lottie" />,
}));
import { WalletHero } from "../wallet-hero";
import { EarnSpendTiles } from "../earn-spend-tiles";
afterEach(cleanup);
describe("WalletHero", () => {
  it("shows coins and money value", () => {
    render(<WalletHero coins={1240} money={12.4} />);
    expect(screen.getByText("1240")).toBeInTheDocument();
    expect(screen.getByText(/\$12\.40/)).toBeInTheDocument();
  });
  it("hides money when null", () => {
    render(<WalletHero coins={1240} money={null} />);
    expect(screen.queryByText(/\$/)).toBeNull();
  });
});
describe("EarnSpendTiles", () => {
  it("shows earned and spent", () => {
    render(<EarnSpendTiles earned={2100} spent={860} />);
    expect(screen.getByText("2100")).toBeInTheDocument();
    expect(screen.getByText("860")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — FAIL.

- [ ] **Step 3: Implement** both components (`"use client"`). `WalletHero`: a card with a coin-burst `<Lottie src="/lottie/coin-burst.json" mode="loop" className="size-16"/>`, `<AnimatedNumber value={coins}/>` + " coins", and when `money != null` a `<AnimatedNumber value={money} format={(n)=>` ≈ $${n.toFixed(2)}`}/>`. `EarnSpendTiles`: two tiles with `<AnimatedNumber>` for earned/spent, tinted `text-ok`/`text-bad`.

- [ ] **Step 4: Run it, verify it passes** — GREEN.

- [ ] **Step 5: Typecheck + commit**
```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add components/customer/wallet/wallet-hero.tsx components/customer/wallet/earn-spend-tiles.tsx components/customer/wallet/__tests__/wallet-hero.test.tsx
git commit -m "feat(wallet): <WalletHero> + <EarnSpendTiles>"
```

---

### Task 4: `<WalletLog>` + facets spec

**Files:**
- Create: `apps/tiffin-grab/components/customer/wallet/wallet-facets.ts`
- Create: `apps/tiffin-grab/components/customer/wallet/wallet-log.tsx`
- Test: `apps/tiffin-grab/components/customer/wallet/__tests__/wallet-log.test.tsx`

**Interfaces:**
- Consumes: `WalletTx` (service), `FacetFilters`/`ListPagination` (from `@realm/design-system` — confirm the barrel by mirroring `dashboard/orders/orders-list.tsx`), `eventLabel`, `formatEpoch`, `Reveal` + `LottieEmptyState` from `@/components/motion`.
- Produces: `WALLET_FACETS: FacetDef[]` (in `wallet-facets.ts`) and `WalletLog({ items, page, size, total }: { items: WalletTx[]; page: number; size: number; total: number })` + `WalletLogSkeleton`.

- [ ] **Step 1: Read** `dashboard/orders/orders-list.tsx` for how `<FacetFilters spec>` + rows + `<ListPagination>` are composed + their exact import paths.

- [ ] **Step 2: Define facets** — `wallet-facets.ts`:
```ts
import type { FacetDef } from "@realm/design-system"; // adjust to the real barrel confirmed in Step 1
export const WALLET_FACETS: FacetDef[] = [
  { kind: "pills", field: "direction", label: "Type", options: [{ value: "credit", label: "Earned" }, { value: "debit", label: "Spent" }] },
  { kind: "dateRange", field: "createdAt", label: "Date" },
];
```

- [ ] **Step 3: Write the failing test**

Create `apps/tiffin-grab/components/customer/wallet/__tests__/wallet-log.test.tsx` (jsdom). Mock `@/components/motion` (Reveal passthrough, LottieEmptyState), mock `@realm/design-system` FacetFilters/ListPagination as passthrough stubs, mock the timezone provider. Assert: rows render `eventLabel`'d label + `±coins`; empty items → the empty state.
```tsx
// mock stubs for FacetFilters/ListPagination + motion, then:
render(<WalletLog items={[{ publicId: "w1", direction: "credit", coins: 50, eventType: "signup", sourceType: "signup", sourceId: "s", memo: null, createdAt: 1_700_000_000_000, orderPublicId: null }] as never} page={0} size={25} total={1} />);
expect(screen.getByText(/Signup/)).toBeInTheDocument();
expect(screen.getByText(/\+50/)).toBeInTheDocument();
```

- [ ] **Step 4: Run it, verify it fails** — FAIL.

- [ ] **Step 5: Implement** `wallet-log.tsx` (`"use client"`): `<FacetFilters spec={WALLET_FACETS}/>`, then `Reveal.Group` of rows — each: `eventLabel(tx.eventType ?? tx.sourceType)`, `formatEpoch(tx.createdAt)`, and `{tx.direction === "credit" ? "+" : "−"}{tx.coins}` tinted ok/bad; then `<ListPagination page={page} size={size} total={total}/>`. Empty (`items.length === 0`) → `<LottieEmptyState animation="coin-burst" title="No wallet activity yet"/>`. Provide `WalletLogSkeleton`.

- [ ] **Step 6: Run it, verify it passes** — GREEN.

- [ ] **Step 7: Typecheck + commit**
```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add components/customer/wallet/wallet-facets.ts components/customer/wallet/wallet-log.tsx components/customer/wallet/__tests__/wallet-log.test.tsx
git commit -m "feat(wallet): <WalletLog> filterable paginated log"
```

---

### Task 5: `/me/wallet` route + loader

**Files:**
- Create: `apps/tiffin-grab/app/(customer)/me/wallet/page.tsx`
- Test: `apps/tiffin-grab/app/(customer)/me/wallet/__tests__/wallet-page.test.ts` (loader helper unit)

**Interfaces:**
- Consumes: `walletService.{balance, earnSpendTotals, moneyValue, ledgerPage}`, `parseFilterState`, `WALLET_FACETS`, `WalletHero`/`EarnSpendTiles`/`WalletLog`, `getAppSettings` (for the currency), `currentUserId`.

- [ ] **Step 1: Read** `dashboard/orders/page.tsx` for the `parseFilterState(spec, await searchParams)` → service-read → render wiring, and `getAppSettings()` for the currency field (confirm `.currency`; if absent, default `"CAD"`).

- [ ] **Step 2: Implement the page**

Create `app/(customer)/me/wallet/page.tsx`:
- `currentUserId()`; null → `redirect("/login")`.
- `const currency = (await getAppSettings()).currency ?? "CAD";`
- `const { condition, page } = parseFilterState(WALLET_FACETS, await searchParams);`
- `Promise.all([ walletService.balance(userId), walletService.earnSpendTotals(userId), walletService.ledgerPage(userId, condition, page) ])`; then `const money = await walletService.moneyValue(balance, currency);`
- Render `PageShell`/header + `<WalletHero coins={balance} money={money}/>` + `<EarnSpendTiles earned spent/>` + `<WalletLog items page size total/>`. Wrap the ledger part in a `<Suspense>` island with `<WalletLogSkeleton>` mirroring `me/meals`/`me/page` islands.
- Type `searchParams` as `Promise<Record<string,string|undefined>>` (Next 16).

- [ ] **Step 3: Test (loader helper)** — extract any nontrivial mapping (e.g. `moneyLabel(money)` or the facets→condition already covered) — if the page has no pure helper worth testing, add a tiny test asserting `WALLET_FACETS` contains the direction pills with credit/debit values:
```ts
import { WALLET_FACETS } from "@/components/customer/wallet/wallet-facets";
it("offers earned/spent direction facet", () => {
  const dir = WALLET_FACETS.find((f) => "field" in f && f.field === "direction");
  expect(dir).toBeTruthy();
});
```
Run + GREEN.

- [ ] **Step 4: Typecheck + commit**
```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add "app/(customer)/me/wallet" && git commit -m "feat(customer): /me/wallet route (hero + tiles + log)"
```

---

### Task 6: Home peek + nav + full verify

**Files:**
- Modify: `apps/tiffin-grab/components/customer/home/wallet-section.tsx`
- Modify: `apps/tiffin-grab/components/customer/customer-bottom-nav.tsx` + `customer-sidebar.tsx`
- Test: extend `apps/tiffin-grab/components/customer/__tests__/customer-bottom-nav.test.tsx`

- [ ] **Step 1: Read** `wallet-section.tsx` + the nav files.

- [ ] **Step 2: Write the failing test** — extend the bottom-nav test with a "Wallet" tab → `/me/wallet` case (mirror the Slice-2 Meals-tab test).

- [ ] **Step 3: Run it, verify it fails** — FAIL.

- [ ] **Step 4: Implement**
- `wallet-section.tsx` (home peek): keep the balance card + add the money value (pass it in — or leave coins-only if the home loader doesn't compute money; simplest: keep as-is and append a "View wallet →" `TransitionLink` to `/me/wallet` under the section; optionally trim the tx list to ~3 rows). Do NOT duplicate the full log.
- Nav: add `{ href: "/me/wallet", title: "Wallet", icon: WalletIcon }` (lucide) to `customer-bottom-nav.tsx` `TABS` + `customer-sidebar.tsx`.

- [ ] **Step 5: Run it, verify it passes** — GREEN.

- [ ] **Step 6: Full verify gate** — `cd /Users/lawbringr/IdeaProjects/realm-wt-2f09d8c4 && pnpm turbo typecheck && pnpm turbo test`. Typecheck clean; new + motion suites pass; note any PRE-EXISTING unrelated failures (login-form/phone/app-settings/RabbitMQ/flaky live-DB), your touched files pass.

- [ ] **Step 7: Manual browser check** — log in as a `user` with wallet history: `/me/wallet` shows coin balance counting up + coin-burst animating (now fixed), "≈ $" money value (or coins-only if no rate), earn/spend tiles, filterable log (Earned/Spent pills), pagination. Home wallet peek links to it.

- [ ] **Step 8: Commit**
```bash
git add apps/tiffin-grab/components/customer/home/wallet-section.tsx apps/tiffin-grab/components/customer/customer-bottom-nav.tsx apps/tiffin-grab/components/customer/customer-sidebar.tsx apps/tiffin-grab/components/customer/__tests__/customer-bottom-nav.test.tsx
git commit -m "feat(customer): wallet home peek + nav entry"
```

---

## Self-Review

**Spec coverage:**
- Paginated filterable coins log (framework) → Task 1 (read) + Task 4 (facets + UI) + Task 5 (wiring). ✓
- Earn/spend totals → Task 2 + Task 3 tiles. ✓
- Money value (coins × rate, degrades on no rate) → Task 2 `moneyValue` + Task 3 hero. ✓
- Coin balance hero + coin-burst → Task 3. ✓
- `/me/wallet` route → Task 5. ✓
- Home peek + nav → Task 6. ✓
- IDOR scoping on the ledger read → Task 1 (userId AND'd outside the facet condition). ✓
- No schema change / display-only → held. ✓

**Placeholder scan:** The framework import barrel (`@realm/design-system` for `FacetDef`/`FacetFilters`/`ListPagination`/`parseFilterState`) is marked "confirm by mirroring `dashboard/orders`" — a real read-then-match (the exact barrel isn't 100% certain from the plan), with full usage code given. Live-DB tests use concrete direct `wallet_ledger` inserts. All component tests + service code are complete.

**Type consistency:** `WalletTx` (existing) flows from `ledgerPage` (Task 1) → `WalletLog` (Task 4) → page (Task 5). `Condition`/`PageRequest`/`Page` from `@realm/commons`. `moneyValue: number | null` (Task 2) → `WalletHero.money` (Task 3). `WALLET_FACETS: FacetDef[]` (Task 4) → `parseFilterState` (Task 5). `earnSpendTotals` shape (Task 2) → `EarnSpendTiles` (Task 3).

**IDOR note:** Task 1's read is the security-critical unit — the reviewer/verify must confirm the `userId` scope is AND'd from the session and is NOT reachable via the facet resolver (no `userId` field in `columnResolver`).
