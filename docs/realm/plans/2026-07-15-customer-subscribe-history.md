# Customer Subscribe History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a logged-in customer their existing + past subscriptions above the wizard on `/subscribe`.

**Architecture:** One new user-scoped read (`mySubscriptionsSummary`, all statuses), one `<ExistingSubscriptions>` component (Current/Past groups), and a thin wire into the (public, already `force-dynamic`) `subscribe/page.tsx`. No DB schema change. No country-code/phone code touched (owned by a concurrent session, already shipped).

**Tech Stack:** Next.js 16, React 19, Drizzle, Vitest (live-DB + jsdom), Slice-0 `@/components/motion`, the existing `OrderStatusBadge`.

## Global Constraints

- All in `apps/tiffin-grab`. **No DB schema change.** **Do NOT touch any country-code / phone-input code** (checkout/login/signup/profile — concurrent session's domain, fully merged).
- IDOR: the read is scoped by `orders.userId = userId`; the page passes `currentUserId()`, never client input.
- `"use client"` on the component; `cn` from `@realm/ui/cn`; reduced-motion honored. `Reveal` from `@/components/motion`.
- Verify gate after each task: `pnpm --filter tiffin-grab exec tsc --noEmit` + the task test. Final: `pnpm turbo typecheck && pnpm turbo test`.
- Worktree `/Users/lawbringr/IdeaProjects/realm-wt-2f09d8c4`, branch `wt/slice5-subhistory`. node_modules installed. Local Postgres reachable.

## Reuse reference (exact)

- `myWaitlistedSubscriptions` (`customer-deliveries.service.ts:118`) is the read to mirror: joins `orders ⋈ plans ⋈ mealSizes ⋈ deliveryFrequencies`, `where(and(eq(orders.userId, userId), inArray(orders.status, [...])))`. Drop the status filter, add `createdAt`, order `desc`.
- `OrderStatusBadge({ status: string })` (`components/ds/order-status-badge.tsx`) maps `pending/active/waitlisted/paused/cancelled` → label+tone; **`completed` is missing** (falls back to neutral + raw "completed").
- `subscribe/page.tsx` — public, `force-dynamic`, loads `loadCatalogSnapshot()` → `<Wizard catalog={toClientCatalog(catalog)}/>`. `currentUserId()` from `@/lib/services/session-service` reads the session in a server component.
- Live-DB seed: Slice-4 harness (`makeOrder` provisions an active in-zone order; flip status via `db.update(orders)` for a cancelled one) — mirror `app/(customer)/me/deliveries/__tests__/actions.test.ts`.

## File Structure

- `lib/services/customer-deliveries.service.ts` — add `SubSummary` + `mySubscriptionsSummary`.
- `components/ds/order-status-badge.tsx` — add `completed`.
- `components/customer/subscribe/existing-subscriptions.tsx` — NEW.
- `app/(public)/subscribe/page.tsx` — wire in.
- Tests colocated.

---

### Task 1: `mySubscriptionsSummary` read

**Files:**
- Modify: `apps/tiffin-grab/lib/services/customer-deliveries.service.ts`
- Test: `apps/tiffin-grab/lib/services/__tests__/my-subscriptions-summary.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SubSummary = { publicId: string; planName: string; mealSizeName: string; daysPerWeek: number; status: string; createdAt: number };
  export async function mySubscriptionsSummary(userId: bigint): Promise<SubSummary[]>;
  ```

- [ ] **Step 1: Read** `myWaitlistedSubscriptions` in the same file for the join pattern + confirm `desc` is imported (it is, used by `myDeliveryHistory`).

- [ ] **Step 2: Write the failing test**

Create `apps/tiffin-grab/lib/services/__tests__/my-subscriptions-summary.test.ts` using the Slice-4 harness (`reset`/`makeOrder`/`userIdOf`). Seed: user A with one active order (via `makeOrder`) + flip a second order to `cancelled` (make another order for the same user, `db.update(orders).set({status:"cancelled"})`); user B with one order. Assert:
```ts
const { mySubscriptionsSummary } = await import("@/lib/services/customer-deliveries.service");
const subs = await mySubscriptionsSummary(userAId);
expect(subs.length).toBe(2);                              // both statuses returned
expect(subs.map((s) => s.status).sort()).toEqual(["active", "cancelled"]);
expect(subs.every((s) => s.planName && s.mealSizeName)).toBe(true);
// newest first
expect(subs[0].createdAt).toBeGreaterThanOrEqual(subs[1].createdAt);
// IDOR: user B's order not present (A has exactly 2)
```

- [ ] **Step 3: Run it, verify it fails** — `pnpm exec vitest run lib/services/__tests__/my-subscriptions-summary.test.ts` → FAIL (not a function).

- [ ] **Step 4: Implement**

Append to `customer-deliveries.service.ts`:
```ts
export type SubSummary = { publicId: string; planName: string; mealSizeName: string; daysPerWeek: number; status: string; createdAt: number };

// All of a customer's subscriptions across every status, newest first — for the
// "you already have" summary on /subscribe. Current (active/paused/waitlisted/
// pending) vs past (cancelled/completed) grouping is done in the component.
export async function mySubscriptionsSummary(userId: bigint): Promise<SubSummary[]> {
  return db
    .select({
      publicId: orders.publicId, planName: plans.name, mealSizeName: mealSizes.name,
      daysPerWeek: deliveryFrequencies.daysPerWeek, status: orders.status, createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt));
}
```

- [ ] **Step 5: Run it, verify it passes** — GREEN. Then `pnpm exec vitest run lib/services/__tests__` (no regression).

- [ ] **Step 6: Typecheck + commit**
```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add lib/services/customer-deliveries.service.ts lib/services/__tests__/my-subscriptions-summary.test.ts
git commit -m "feat(customer): mySubscriptionsSummary read (all statuses)"
```

---

### Task 2: `<ExistingSubscriptions>` + `completed` badge

**Files:**
- Create: `apps/tiffin-grab/components/customer/subscribe/existing-subscriptions.tsx`
- Modify: `apps/tiffin-grab/components/ds/order-status-badge.tsx`
- Test: `apps/tiffin-grab/components/customer/subscribe/__tests__/existing-subscriptions.test.tsx`

**Interfaces:**
- Consumes: `SubSummary` (Task 1), `OrderStatusBadge` (`@/components/ds`), `Reveal` (`@/components/motion`).
- Produces: `ExistingSubscriptions({ subs }: { subs: SubSummary[] })`.

- [ ] **Step 1: Add `completed` to the badge**

In `components/ds/order-status-badge.tsx` add `completed: "Completed"` to `ORDER_STATUS_LABEL` and `completed: "neutral"` to `STATUS_VARIANT`.

- [ ] **Step 2: Write the failing test**

Create `apps/tiffin-grab/components/customer/subscribe/__tests__/existing-subscriptions.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/motion", () => ({
  Reveal: Object.assign(({ children }: { children: React.ReactNode }) => <div>{children}</div>, { Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }),
}));
import { ExistingSubscriptions } from "../existing-subscriptions";
const mk = (status: string, name: string) => ({ publicId: name, planName: name, mealSizeName: "Medium", daysPerWeek: 5, status, createdAt: 1 });
afterEach(cleanup);
describe("ExistingSubscriptions", () => {
  it("groups current vs past and renders rows", () => {
    render(<ExistingSubscriptions subs={[mk("active", "Veg"), mk("cancelled", "Old")] as never} />);
    expect(screen.getByText(/already have/i)).toBeInTheDocument();
    expect(screen.getByText(/Past subscriptions/i)).toBeInTheDocument();
    expect(screen.getByText(/Veg/)).toBeInTheDocument();
    expect(screen.getByText(/Old/)).toBeInTheDocument();
  });
  it("renders nothing when empty", () => {
    const { container } = render(<ExistingSubscriptions subs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 3: Run it, verify it fails** — FAIL (module missing).

- [ ] **Step 4: Implement**

Create `apps/tiffin-grab/components/customer/subscribe/existing-subscriptions.tsx`:
```tsx
"use client";

import { OrderStatusBadge } from "@/components/ds";
import { Reveal } from "@/components/motion";
import type { SubSummary } from "@/lib/services/customer-deliveries.service";

const CURRENT = new Set(["active", "paused", "waitlisted", "pending"]);

function Group({ title, subs }: { title: string; subs: SubSummary[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <Reveal.Group className="divide-y">
        {subs.map((s) => (
          <Reveal key={s.publicId} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-sm">{s.planName} · {s.mealSizeName} · {s.daysPerWeek} days/wk</span>
            <OrderStatusBadge status={s.status} />
          </Reveal>
        ))}
      </Reveal.Group>
    </section>
  );
}

export function ExistingSubscriptions({ subs }: { subs: SubSummary[] }) {
  if (subs.length === 0) return null;
  const current = subs.filter((s) => CURRENT.has(s.status));
  const past = subs.filter((s) => !CURRENT.has(s.status));
  return (
    <div className="space-y-4">
      {current.length > 0 && <Group title="You already have" subs={current} />}
      {past.length > 0 && <Group title="Past subscriptions" subs={past} />}
    </div>
  );
}
```

- [ ] **Step 5: Run it, verify it passes** — GREEN.

- [ ] **Step 6: Typecheck + commit**
```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add components/customer/subscribe/existing-subscriptions.tsx components/ds/order-status-badge.tsx components/customer/subscribe/__tests__/existing-subscriptions.test.tsx
git commit -m "feat(customer): <ExistingSubscriptions> current/past groups"
```

---

### Task 3: Wire into `/subscribe` + full verify

**Files:**
- Modify: `apps/tiffin-grab/app/(public)/subscribe/page.tsx`

- [ ] **Step 1: Read** `subscribe/page.tsx` (above) for the exact current structure.

- [ ] **Step 2: Implement**

Edit `app/(public)/subscribe/page.tsx`:
- Add imports: `currentUserId` from `@/lib/services/session-service`, `mySubscriptionsSummary` from `@/lib/services/customer-deliveries.service`, `ExistingSubscriptions` from `@/components/customer/subscribe/existing-subscriptions`.
- In the component: resolve the user + load in parallel:
  ```tsx
  const userId = await currentUserId();
  const [catalog, subs] = await Promise.all([
    loadCatalogSnapshot(),
    userId != null ? mySubscriptionsSummary(userId) : Promise.resolve([]),
  ]);
  ```
- Render, above the wizard `<div className="mt-8">`:
  ```tsx
  {subs.length > 0 && (
    <div className="mt-6">
      <ExistingSubscriptions subs={subs} />
    </div>
  )}
  ```
- Change the wizard block's context so the wizard reads as "start a new plan" (e.g. add a small `<h2 className="mt-8 text-sm font-semibold">Start a new plan</h2>` before `<Wizard>` when `subs.length > 0`). Keep `force-dynamic` (already set) and the existing catalog logic.

- [ ] **Step 3: Typecheck**
```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
```
(No dedicated unit test — the page is thin server glue; the read (Task 1) and component (Task 2) are unit-tested. Verification is the full gate + the manual browser check below.)

- [ ] **Step 4: Full verify gate**

Run: `cd /Users/lawbringr/IdeaProjects/realm-wt-2f09d8c4 && pnpm turbo typecheck && pnpm turbo test`
Expected: typecheck clean; new + motion suites pass; note any PRE-EXISTING unrelated failures (login-form/phone/app-settings/RabbitMQ/flaky live-DB), touched files pass.

- [ ] **Step 5: Manual browser check**

`/subscribe` while logged in as a `user` with an active + a cancelled order → the "You already have" + "Past subscriptions" groups render above the wizard. Log out → `/subscribe` shows the wizard only (unchanged).

- [ ] **Step 6: Commit**
```bash
git add "app/(public)/subscribe/page.tsx"
git commit -m "feat(customer): show existing/past subscriptions on /subscribe when logged in"
```

---

## Self-Review

**Spec coverage:**
- New all-status user-scoped read → Task 1. ✓
- Current/Past grouping component → Task 2. ✓
- `completed` badge (read includes completed) → Task 2. ✓
- Logged-in wiring, anonymous unchanged → Task 3. ✓
- Motion (Reveal), reduced-motion → Task 2. ✓
- No schema change; no country-code/phone touched → held (files touched: one service, one badge, one new component, one page). ✓

**Placeholder scan:** None — all code (read, component, badge edit, page wiring) is complete. Task 3 has no unit test by design (thin RSC glue; read + component are unit-tested) — flagged explicitly, not a hidden gap. Live-DB test (Task 1) uses the concrete Slice-4 harness.

**Type consistency:** `SubSummary` (Task 1) consumed by `ExistingSubscriptions` (Task 2) and the page (Task 3). `OrderStatusBadge({status: string})` accepts the raw enum (Task 2 adds `completed`). The page's `subs` is `SubSummary[]` from the read.

**IDOR note:** Task 1's read is user-scoped; Task 3 passes `currentUserId()` (never client input) and renders nothing for anonymous visitors.
