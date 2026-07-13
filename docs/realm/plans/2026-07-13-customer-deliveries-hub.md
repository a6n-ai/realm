# Customer Deliveries Hub + Waitlist Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make waitlisted/pending subscriptions visible in-app (fixing the "subscription created but shows no orders" bug) and add a delivery history + activity log by wiring the already-provisioned `order_activities` delivery events.

**Architecture:** Read + audit only — no DB schema change, no pricing/amount logic. A new `myWaitlistedSubscriptions` read + a `<WaitlistCard>` drive a three-way empty state on home and deliveries. The four customer delivery mutations gain an `actorId` and write `order_activities` rows inside their existing transaction. A past-deliveries read + a derived status label + a user-scoped activity read power a "History" section on the deliveries page.

**Tech Stack:** Next.js 16, React 19, Drizzle (Postgres), Vitest (live-DB for services, jsdom for components), Slice-0 motion primitives (`@/components/motion`).

## Global Constraints

- All code in `apps/tiffin-grab`. **No DB schema change** (`order_activities` already has `deliveryId` + enum `skipped`/`unskipped`/`delivery_address_changed`).
- **No `order_status`/`delivery_status` enum change.** No new `delivered` status — "Delivered" is a **derived label only**.
- Audit rows: `created_by` from the **session actor**, never from input (AGENTS.md). Delivery activity rows set `orderId`, `type`, `deliveryId`, `createdBy`.
- IDOR: every customer read/mutation is scoped by `orders.userId = userId`; not-owned throws `NotFoundError` (no existence oracle).
- Waitlist surfaces statuses `["waitlisted","pending"]`; `myActiveSubscriptions` (`["active","paused"]`) stays **unchanged**.
- `"use client"` on new client components (tsc can't catch a missing directive).
- Motion via existing `@/components/motion` (`Lottie`, `LottieEmptyState`, `Reveal`) — no new deps.
- Live-DB service tests: scope all fixtures + cleanup to the test's OWN identifiers (parallel suites share the `users` table); needs `DATABASE_URL` + `REDIS_URL`. Mirror an existing live-DB service test for seed/cleanup helpers.
- Verify gate after each task: `pnpm --filter tiffin-grab exec tsc --noEmit` + the task's test. Final task runs `pnpm turbo typecheck && pnpm turbo test`.
- Worktree: `/Users/lawbringr/IdeaProjects/realm-wt-2f09d8c4`, branch `wt/slice4-deliveries`. node_modules already installed.

## File Structure

- `lib/services/customer-deliveries.service.ts` — add `myWaitlistedSubscriptions`, `myDeliveryHistory`, `myDeliveryActivity` (+ types). Existing reads untouched.
- `lib/services/deliveries.service.ts` — add `actorId` param + `order_activities` insert to `skipDelivery`/`unskipDelivery`/`setDeliveryAddress`/`clearDeliveryAddress`.
- `lib/services/order-activity-describe.ts` — NEW: shared `describeActivity()` extracted from the admin page.
- `lib/deliveries/display-status.ts` — NEW: pure derived-status helper.
- `components/customer/home/waitlist-card.tsx` — NEW `<WaitlistCard>`.
- `components/customer/home/subscription-section.tsx` — three-way empty.
- `app/(customer)/me/page.tsx` — load waitlisted for home.
- `app/(customer)/me/deliveries/{page.tsx,delivery-calendar.tsx,actions.ts}` — three-way empty + Browse CTA + History section; pass `actorId` into mutations.
- `app/(dashboard)/dashboard/orders/[id]/{page.tsx,actions.ts}` — use extracted `describeActivity`; pass actor into the shared mutations.
- Tests colocated in each area's `__tests__/`.

---

### Task 1: `myWaitlistedSubscriptions` read

**Files:**
- Modify: `apps/tiffin-grab/lib/services/customer-deliveries.service.ts`
- Test: `apps/tiffin-grab/lib/services/__tests__/waitlisted-subscriptions.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type WaitlistedSubscription = {
    publicId: string; planName: string; mealSizeName: string;
    daysPerWeek: number; status: "waitlisted" | "pending";
    fullName: string; addressLine: string; city: string; postalCode: string;
  };
  export async function myWaitlistedSubscriptions(userId: bigint): Promise<WaitlistedSubscription[]>;
  ```

- [ ] **Step 1: Read the existing service** to reuse its imports/patterns: open `lib/services/customer-deliveries.service.ts` (note `myActiveSubscriptions` at the top joins `orders`→`plans`, filters `inArray(orders.status, ["active","paused"])`). Note `orders` has `mealSizeId`, `frequencyId`; catalog tables `mealSizes` (`.name`) and `deliveryFrequencies` (`.daysPerWeek`).

- [ ] **Step 2: Write the failing test**

Create `apps/tiffin-grab/lib/services/__tests__/waitlisted-subscriptions.test.ts`. **First READ an existing live-DB service test** in the repo (e.g. `app/(customer)/me/deliveries/__tests__/actions.test.ts`) and reuse its seed/cleanup helpers + `beforeEach`/`afterEach` scoping. The test must:
- seed a user + a `waitlisted` order (plan, mealSize, frequency) + an `active` order for the same user.
- assert `myWaitlistedSubscriptions(userId)` returns exactly the waitlisted one, with `planName`, `mealSizeName`, `daysPerWeek`, `postalCode`, `status: "waitlisted"`.
- assert the `active` order is NOT returned.
- clean up only the identifiers it created.

Assertion core (wrap in the mirrored fixture scaffolding):
```ts
const rows = await myWaitlistedSubscriptions(userId);
expect(rows.map((r) => r.status)).toEqual(["waitlisted"]);
expect(rows[0]).toMatchObject({ planName: expect.any(String), mealSizeName: expect.any(String), daysPerWeek: expect.any(Number), postalCode: expect.any(String) });
```

- [ ] **Step 3: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/services/__tests__/waitlisted-subscriptions.test.ts`
Expected: FAIL — `myWaitlistedSubscriptions` is not exported.

- [ ] **Step 4: Implement**

In `lib/services/customer-deliveries.service.ts`, add the import for `mealSizes, deliveryFrequencies` from `@/db/schema` (extend the existing schema import), then append:

```ts
export type WaitlistedSubscription = {
  publicId: string; planName: string; mealSizeName: string;
  daysPerWeek: number; status: "waitlisted" | "pending";
  fullName: string; addressLine: string; city: string; postalCode: string;
};

// Waitlisted/pending orders have NO materialized deliveries, so they are absent
// from myActiveSubscriptions (active/paused only). Surfaced separately so the
// logged-in customer sees their pending order instead of a blank "no orders".
export async function myWaitlistedSubscriptions(userId: bigint): Promise<WaitlistedSubscription[]> {
  const rows = await db
    .select({
      publicId: orders.publicId, planName: plans.name, mealSizeName: mealSizes.name,
      daysPerWeek: deliveryFrequencies.daysPerWeek, status: orders.status,
      fullName: orders.fullName, addressLine: orders.addressLine, city: orders.city, postalCode: orders.postalCode,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
    .where(and(eq(orders.userId, userId), inArray(orders.status, ["waitlisted", "pending"])));
  return rows.map((r) => ({ ...r, status: r.status as "waitlisted" | "pending" }));
}
```

- [ ] **Step 5: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/services/__tests__/waitlisted-subscriptions.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add lib/services/customer-deliveries.service.ts lib/services/__tests__/waitlisted-subscriptions.test.ts
git commit -m "feat(customer): myWaitlistedSubscriptions read"
```

---

### Task 2: `<WaitlistCard>` component

**Files:**
- Create: `apps/tiffin-grab/components/customer/home/waitlist-card.tsx`
- Test: `apps/tiffin-grab/components/customer/home/__tests__/waitlist-card.test.tsx`

**Interfaces:**
- Consumes: `WaitlistedSubscription` (Task 1), `Lottie` from `@/components/motion`, `cn` from `@realm/ui/cn`.
- Produces: `export function WaitlistCard({ sub }: { sub: WaitlistedSubscription })`.

- [ ] **Step 1: Write the failing test**

Create `apps/tiffin-grab/components/customer/home/__tests__/waitlist-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/motion", () => ({ Lottie: ({ label }: { label?: string }) => <div data-testid="lottie" aria-label={label} /> }));

import { WaitlistCard } from "../waitlist-card";

const base = { publicId: "ord_1", planName: "Veg Tiffin", mealSizeName: "Medium", daysPerWeek: 5, fullName: "A", addressLine: "1 St", city: "Toronto", postalCode: "M4B 1B3" };

afterEach(cleanup);

describe("WaitlistCard", () => {
  it("shows waitlist copy + order summary for a waitlisted order", () => {
    render(<WaitlistCard sub={{ ...base, status: "waitlisted" }} />);
    expect(screen.getByText(/on the waitlist/i)).toBeInTheDocument();
    expect(screen.getByText(/Veg Tiffin/)).toBeInTheDocument();
    expect(screen.getByText(/Medium/)).toBeInTheDocument();
    expect(screen.getByText(/M4B 1B3/)).toBeInTheDocument();
  });

  it("shows a processing variant for a pending order", () => {
    render(<WaitlistCard sub={{ ...base, status: "pending" }} />);
    expect(screen.getByText(/processing/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/home/__tests__/waitlist-card.test.tsx`
Expected: FAIL — cannot resolve `../waitlist-card`.

- [ ] **Step 3: Implement**

Create `apps/tiffin-grab/components/customer/home/waitlist-card.tsx`:

```tsx
"use client";

import { Lottie } from "@/components/motion";
import { Card } from "@/components/ds";
import type { WaitlistedSubscription } from "@/lib/services/customer-deliveries.service";

export function WaitlistCard({ sub }: { sub: WaitlistedSubscription }) {
  const waitlisted = sub.status === "waitlisted";
  return (
    <Card variant="flat" className="flex flex-col items-center gap-3 p-6 text-center">
      <Lottie src="/lottie/delivery-scooter.json" mode="loop" label={waitlisted ? "On the waitlist" : "Processing"} className="size-32" />
      <p className="text-base font-semibold">{waitlisted ? "You're on the waitlist" : "Processing your subscription…"}</p>
      <p className="text-muted-foreground text-sm">
        {sub.planName} · {sub.mealSizeName} · {sub.daysPerWeek} days/week
      </p>
      <p className="text-muted-foreground text-xs">
        {sub.postalCode}{waitlisted ? " — not served yet" : ""}
      </p>
      {waitlisted ? (
        <p className="text-muted-foreground text-sm">We'll email you when we reach your area.</p>
      ) : null}
    </Card>
  );
}
```

Note: `Card` import path is `@/components/ds` (verify it exports `Card` — wallet-section.tsx imports it the same way). If `variant="flat"` isn't a valid prop, drop it.

- [ ] **Step 4: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/home/__tests__/waitlist-card.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add components/customer/home/waitlist-card.tsx components/customer/home/__tests__/waitlist-card.test.tsx
git commit -m "feat(customer): <WaitlistCard> waitlist/pending state"
```

---

### Task 3: Home three-way empty (subscription section)

**Files:**
- Modify: `apps/tiffin-grab/components/customer/home/subscription-section.tsx`
- Modify: `apps/tiffin-grab/app/(customer)/me/page.tsx`
- Test: `apps/tiffin-grab/components/customer/home/__tests__/subscription-section.waitlist.test.tsx`

**Interfaces:**
- Consumes: `WaitlistCard` (Task 2), `myWaitlistedSubscriptions` (Task 1).

- [ ] **Step 1: Read both files.** In `subscription-section.tsx` find the zero-subscription branch (currently renders "No active subscriptions yet." + `<Link href="/subscribe">Browse plans</Link>`, ~line 125-134). In `me/page.tsx` find where the subscription section is loaded/rendered and how props flow. Determine the component's props signature.

- [ ] **Step 2: Write the failing test**

Create `apps/tiffin-grab/components/customer/home/__tests__/subscription-section.waitlist.test.tsx`. Mock `@/components/motion` (as in Task 2) and any data/provider deps the component needs (mirror the existing `subscription-section.test.tsx` for its mock setup — READ it first). Render three cases:
- active subscriptions present → shows subscription content, NOT the waitlist card.
- zero active + a waitlisted sub passed → shows `WaitlistCard` copy (`/on the waitlist/i`), NOT "No active subscriptions".
- zero active + zero waitlisted → shows "No active subscriptions" + a `/subscribe` Browse link.

(Assertions use `screen.getByText`/`queryByText`; keep to the props the component actually takes — adjust after Step 1.)

- [ ] **Step 3: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/home/__tests__/subscription-section.waitlist.test.tsx`
Expected: FAIL — component doesn't yet accept/render waitlisted.

- [ ] **Step 4: Implement**

- In `me/page.tsx`: load `myWaitlistedSubscriptions(userId)` alongside the existing subscription data and pass it to the subscription section (thread through the same Suspense/section wiring the existing active data uses).
- In `subscription-section.tsx`: accept a `waitlisted: WaitlistedSubscription[]` prop. Replace the zero-active branch with three-way logic:
  ```tsx
  // active/paused subs → existing content (unchanged)
  // else if waitlisted.length → waitlisted.map((s) => <WaitlistCard key={s.publicId} sub={s} />)
  // else → existing "No active subscriptions yet." + Browse plans CTA
  ```
  Import `WaitlistCard` from `./waitlist-card`. Keep the existing active-subscription rendering exactly as is.

Do the same for the named skeleton twin if present (leave it unchanged unless it references the new prop).

- [ ] **Step 5: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run components/customer/home/__tests__/subscription-section.waitlist.test.tsx`
Expected: PASS. Also run the existing suite to catch regressions: `pnpm exec vitest run components/customer/home/__tests__`.

- [ ] **Step 6: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add components/customer/home/subscription-section.tsx "app/(customer)/me/page.tsx" components/customer/home/__tests__/subscription-section.waitlist.test.tsx
git commit -m "feat(customer): home shows waitlist state instead of blank no-orders"
```

---

### Task 4: Deliveries page three-way empty + Browse CTA

**Files:**
- Modify: `apps/tiffin-grab/app/(customer)/me/deliveries/delivery-calendar.tsx`
- Modify: `apps/tiffin-grab/app/(customer)/me/deliveries/page.tsx`
- Test: `apps/tiffin-grab/app/(customer)/me/deliveries/__tests__/empty-states.test.tsx`

**Interfaces:**
- Consumes: `WaitlistCard` (Task 2), `myWaitlistedSubscriptions` (Task 1).

- [ ] **Step 1: Read both files.** In `delivery-calendar.tsx` find the empty branch (`subscriptions.length === 0` → bare `<EmptyState icon={CalendarDaysIcon} message="No active subscriptions yet." />`, ~line 305). In `page.tsx` find the data loader (loads `myActiveSubscriptions` + `myDeliveries`). Note `DeliveryCalendar`'s props.

- [ ] **Step 2: Write the failing test**

Create `apps/tiffin-grab/app/(customer)/me/deliveries/__tests__/empty-states.test.tsx` (jsdom). Mock `@/components/motion` + any providers the calendar needs (READ the existing calendar for its imports). Render `DeliveryCalendar` with:
- a subscription + deliveries → shows the list, not the waitlist card.
- zero subscriptions + a waitlisted sub prop → shows `WaitlistCard` copy.
- zero subscriptions + zero waitlisted → shows a Browse plans `/subscribe` link (NEW — today it's a bare message).

- [ ] **Step 3: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run "app/(customer)/me/deliveries/__tests__/empty-states.test.tsx"`
Expected: FAIL.

- [ ] **Step 4: Implement**

- `page.tsx`: load `myWaitlistedSubscriptions(userId)` and pass `waitlisted` into `DeliveryCalendar`.
- `delivery-calendar.tsx`: accept `waitlisted: WaitlistedSubscription[]`. Replace the `subscriptions.length === 0` branch with three-way: active list → existing; else waitlisted → `waitlisted.map((s) => <WaitlistCard key={s.publicId} sub={s} />)`; else → `<EmptyState icon={CalendarDaysIcon} message="No active subscriptions yet." action={<Link href="/subscribe">Browse plans</Link>} />` (the design-system `EmptyState` takes an `action?: ReactNode`). Import `WaitlistCard` + `Link`.

- [ ] **Step 5: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run "app/(customer)/me/deliveries/__tests__/empty-states.test.tsx"`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add "app/(customer)/me/deliveries/delivery-calendar.tsx" "app/(customer)/me/deliveries/page.tsx" "app/(customer)/me/deliveries/__tests__/empty-states.test.tsx"
git commit -m "feat(customer): deliveries page waitlist state + browse CTA"
```

---

### Task 5: Wire delivery activity audit (actorId + order_activities writes)

**Files:**
- Modify: `apps/tiffin-grab/lib/services/deliveries.service.ts`
- Modify: `apps/tiffin-grab/app/(customer)/me/deliveries/actions.ts`
- Modify: `apps/tiffin-grab/app/(dashboard)/dashboard/orders/[id]/actions.ts` (+ any other caller — grep first)
- Test: `apps/tiffin-grab/lib/services/__tests__/delivery-activity.test.ts`

**Interfaces:**
- Produces: new signatures
  ```ts
  skipDelivery(deliveryPublicId: string, actorId: bigint): Promise<void>
  unskipDelivery(deliveryPublicId: string, actorId: bigint): Promise<void>
  setDeliveryAddress(deliveryPublicId: string, input: {...}, actorId: bigint): Promise<void>
  clearDeliveryAddress(deliveryPublicId: string, actorId: bigint): Promise<void>
  ```

- [ ] **Step 1: Grep every caller** of these four functions so none is missed:
```bash
cd apps/tiffin-grab && rg -n "skipDelivery|unskipDelivery|setDeliveryAddress|clearDeliveryAddress" app lib --type ts
```
Record the caller list (expected: `app/(customer)/me/deliveries/actions.ts` + admin `dashboard/orders/[id]/actions.ts`). READ `deliveries.service.ts` around each function (skip at ~186, unskip ~340, setDeliveryAddress ~378, clearDeliveryAddress ~398) to see the existing tx + how it obtains `orderId`.

- [ ] **Step 2: Write the failing test**

Create `apps/tiffin-grab/lib/services/__tests__/delivery-activity.test.ts` (live-DB; mirror an existing service test's seed/cleanup). Seed a user + active order + one scheduled delivery. Then:
- call `skipDelivery(deliveryPublicId, actorId)` → assert one `order_activities` row exists with `type="skipped"`, `deliveryId` = that delivery's id, `createdBy = actorId`, `orderId` = the order.
- call `unskipDelivery(...)` → asserts a `type="unskipped"` row.
- call `setDeliveryAddress(..., input, actorId)` → asserts a `type="delivery_address_changed"` row.
Query via `db.select().from(orderActivities).where(eq(orderActivities.deliveryId, deliveryId))`.

- [ ] **Step 3: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/services/__tests__/delivery-activity.test.ts`
Expected: FAIL — functions don't take `actorId` / no rows written.

- [ ] **Step 4: Implement**

In `deliveries.service.ts`, import `orderActivities` from `@/db/schema` (extend existing import). Add `actorId: bigint` as the last parameter to each of the four functions. Inside each function's existing `db.transaction`, AFTER the status/address update and BEFORE the `reconcileMakeups`/commit, insert an activity row. You already have `orderId` in scope; get the delivery's numeric id from the row the function loads (skip/unskip/address already `select` the delivery — reuse its `.id`; if only `orderId` is loaded, add `.id` to that select). Pattern:

```ts
await tx.insert(orderActivities).values({
  orderId,
  deliveryId,          // the numeric deliveries.id for deliveryPublicId
  type: "skipped",     // "unskipped" | "delivery_address_changed" per function
  createdBy: actorId,
});
```

Update callers:
- `me/deliveries/actions.ts`: each of `skipMyDelivery`/`unskipMyDelivery`/`setMyDeliveryAddress`/`clearMyDeliveryAddress` already has `userId` in scope from `me()` — pass it as `actorId`: `await skipDelivery(deliveryPublicId, userId);` etc.
- Admin `dashboard/orders/[id]/actions.ts` (and any other caller from Step 1): pass the admin's session actor id (use the same session helper the file already uses to get the current staff user; if none, use `currentUserId()` from `@/lib/services/session-service`).

- [ ] **Step 5: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/services/__tests__/delivery-activity.test.ts`
Expected: PASS. Then run the existing deliveries/actions tests to confirm no caller broke: `pnpm exec vitest run "app/(customer)/me/deliveries/__tests__"`.

- [ ] **Step 6: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add lib/services/deliveries.service.ts "app/(customer)/me/deliveries/actions.ts" "app/(dashboard)/dashboard/orders/[id]/actions.ts" lib/services/__tests__/delivery-activity.test.ts
git commit -m "feat(deliveries): write order_activities on skip/unskip/address change"
```

---

### Task 6: `myDeliveryHistory` past-deliveries read

**Files:**
- Modify: `apps/tiffin-grab/lib/services/customer-deliveries.service.ts`
- Test: `apps/tiffin-grab/lib/services/__tests__/delivery-history.test.ts`

**Interfaces:**
- Produces: `export async function myDeliveryHistory(userId: bigint, since: string, before: string): Promise<CustomerDelivery[]>` — deliveries with `deliveryDate` in `[since, before)`, all VISIBLE statuses, `orders.userId = userId`, ordered `deliveryDate` DESC. Reuses the existing `CustomerDelivery` type + `VISIBLE`.

- [ ] **Step 1: Write the failing test**

Create `apps/tiffin-grab/lib/services/__tests__/delivery-history.test.ts` (live-DB, mirror seed/cleanup). Seed a user + order + deliveries dated in the past and future. Assert `myDeliveryHistory(userId, "<30d ago>", "<today>")` returns the past ones (DESC), excludes future ones.

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/services/__tests__/delivery-history.test.ts`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement**

In `customer-deliveries.service.ts`, append (mirrors `myDeliveries` but bounded past + DESC):

```ts
// Past deliveries for the History section. Bounded lookback [since, before);
// `before` is today (exclusive) so it never overlaps the forward myDeliveries window.
export async function myDeliveryHistory(userId: bigint, since: string, before: string): Promise<CustomerDelivery[]> {
  const rows = await db
    .select({ d: deliveries, orderPublicId: orders.publicId, planName: plans.name })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .innerJoin(plans, eq(orders.planId, plans.id))
    .where(and(
      eq(orders.userId, userId),
      inArray(deliveries.status, [...VISIBLE]),
      gte(deliveries.deliveryDate, since),
      lt(deliveries.deliveryDate, before),
    ))
    .orderBy(desc(deliveries.deliveryDate));
  return rows.map((r) => ({ ...r.d, orderPublicId: r.orderPublicId, planName: r.planName, isMakeup: r.d.makeupForDeliveryId !== null }));
}
```

Add `lt`, `desc` to the `drizzle-orm` import at the top of the file.

- [ ] **Step 4: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/services/__tests__/delivery-history.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add lib/services/customer-deliveries.service.ts lib/services/__tests__/delivery-history.test.ts
git commit -m "feat(customer): myDeliveryHistory past-deliveries read"
```

---

### Task 7: Derived delivery status label

**Files:**
- Create: `apps/tiffin-grab/lib/deliveries/display-status.ts`
- Test: `apps/tiffin-grab/lib/deliveries/__tests__/display-status.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function deliveryDisplayStatus(status: string, deliveryDate: string, today: string):
    "Scheduled" | "Delivered" | "Skipped" | "Paused" | "Cancelled";
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/tiffin-grab/lib/deliveries/__tests__/display-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deliveryDisplayStatus } from "../display-status";

describe("deliveryDisplayStatus", () => {
  const today = "2026-07-13";
  it("future scheduled → Scheduled", () => { expect(deliveryDisplayStatus("scheduled", "2026-07-20", today)).toBe("Scheduled"); });
  it("past scheduled → Delivered (derived)", () => { expect(deliveryDisplayStatus("scheduled", "2026-07-05", today)).toBe("Delivered"); });
  it("today scheduled → Scheduled (not yet delivered)", () => { expect(deliveryDisplayStatus("scheduled", today, today)).toBe("Scheduled"); });
  it("skipped → Skipped regardless of date", () => { expect(deliveryDisplayStatus("skipped", "2026-07-05", today)).toBe("Skipped"); });
  it("paused → Paused", () => { expect(deliveryDisplayStatus("paused", "2026-07-05", today)).toBe("Paused"); });
  it("cancelled → Cancelled", () => { expect(deliveryDisplayStatus("cancelled", "2026-07-05", today)).toBe("Cancelled"); });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/deliveries/__tests__/display-status.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `apps/tiffin-grab/lib/deliveries/display-status.ts`:

```ts
// Derived label for the customer view. There is no `delivered` status and no
// confirmation actor — a past, still-"scheduled", non-skipped delivery is
// ASSUMED delivered. Isolated here so a real status can replace the derivation
// later without touching call sites.
export function deliveryDisplayStatus(
  status: string, deliveryDate: string, today: string,
): "Scheduled" | "Delivered" | "Skipped" | "Paused" | "Cancelled" {
  if (status === "skipped") return "Skipped";
  if (status === "paused") return "Paused";
  if (status === "cancelled") return "Cancelled";
  // status === "scheduled"
  return deliveryDate < today ? "Delivered" : "Scheduled";
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/deliveries/__tests__/display-status.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/tiffin-grab/lib/deliveries/display-status.ts apps/tiffin-grab/lib/deliveries/__tests__/display-status.test.ts
git commit -m "feat(deliveries): derived display-status label helper"
```

---

### Task 8: Shared `describeActivity` + user-scoped `myDeliveryActivity`

**Files:**
- Create: `apps/tiffin-grab/lib/services/order-activity-describe.ts`
- Modify: `apps/tiffin-grab/app/(dashboard)/dashboard/orders/[id]/page.tsx` (use the extracted fn)
- Modify: `apps/tiffin-grab/lib/services/customer-deliveries.service.ts` (add `myDeliveryActivity`)
- Test: `apps/tiffin-grab/lib/services/__tests__/my-delivery-activity.test.ts`
- Test: `apps/tiffin-grab/lib/services/__tests__/order-activity-describe.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function describeActivity(a: { type: string; note: string | null; fromStatus: string | null; toStatus: string | null }): string;
  export type CustomerActivity = { publicId: string; type: string; note: string | null; fromStatus: string | null; toStatus: string | null; deliveryId: bigint | null; createdAt: number; orderPublicId: string };
  export async function myDeliveryActivity(userId: bigint, limit?: number): Promise<CustomerActivity[]>;
  ```

- [ ] **Step 1: Extract `describeActivity`.** READ `app/(dashboard)/dashboard/orders/[id]/page.tsx:26` — the inline `function describe(a)`. Move its body verbatim into a new `lib/services/order-activity-describe.ts` as `export function describeActivity(...)`, and in the admin page replace the inline function with an import + call rename (`describe(a)` → `describeActivity(a)`).

- [ ] **Step 2: Write the failing tests**

`order-activity-describe.test.ts` (pure): assert a couple mappings the extracted function must preserve — e.g. `describeActivity({ type: "skipped", note: null, fromStatus: null, toStatus: null })` returns a non-empty string containing "kip"; `type: "delivery_address_changed"` returns a string mentioning address. (Match whatever labels the extracted map actually uses — read them in Step 1 and assert on the real text.)

`my-delivery-activity.test.ts` (live-DB, mirror seed/cleanup): seed userA + order + a delivery activity row (or call skipDelivery from Task 5); seed userB + their own activity. Assert `myDeliveryActivity(userAId)` returns userA's rows only (IDOR), newest first, each with `orderPublicId`.

- [ ] **Step 3: Run them, verify they fail**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/services/__tests__/order-activity-describe.test.ts lib/services/__tests__/my-delivery-activity.test.ts`
Expected: FAIL — modules/functions missing.

- [ ] **Step 4: Implement**

`myDeliveryActivity` in `customer-deliveries.service.ts` (import `orderActivities`, `desc`):

```ts
export type CustomerActivity = {
  publicId: string; type: string; note: string | null;
  fromStatus: string | null; toStatus: string | null;
  deliveryId: bigint | null; createdAt: number; orderPublicId: string;
};

// Activity log scoped to the caller's own orders (IDOR via orders.userId).
export async function myDeliveryActivity(userId: bigint, limit = 50): Promise<CustomerActivity[]> {
  return db
    .select({
      publicId: orderActivities.publicId, type: orderActivities.type, note: orderActivities.note,
      fromStatus: orderActivities.fromStatus, toStatus: orderActivities.toStatus,
      deliveryId: orderActivities.deliveryId, createdAt: orderActivities.createdAt, orderPublicId: orders.publicId,
    })
    .from(orderActivities)
    .innerJoin(orders, eq(orderActivities.orderId, orders.id))
    .where(eq(orders.userId, userId))
    .orderBy(desc(orderActivities.createdAt))
    .limit(limit);
}
```

(Confirm `orderActivities.createdAt` is a number-mode column; the select type must match `CustomerActivity`.)

- [ ] **Step 5: Run them, verify they pass**

Run: `cd apps/tiffin-grab && pnpm exec vitest run lib/services/__tests__/order-activity-describe.test.ts lib/services/__tests__/my-delivery-activity.test.ts`
Expected: PASS. Also confirm the admin page still typechecks/renders (tsc).

- [ ] **Step 6: Typecheck + commit**

```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add lib/services/order-activity-describe.ts "app/(dashboard)/dashboard/orders/[id]/page.tsx" lib/services/customer-deliveries.service.ts lib/services/__tests__/order-activity-describe.test.ts lib/services/__tests__/my-delivery-activity.test.ts
git commit -m "feat(customer): shared describeActivity + myDeliveryActivity read"
```

---

### Task 9: History section on the deliveries page

**Files:**
- Modify: `apps/tiffin-grab/app/(customer)/me/deliveries/page.tsx`
- Modify: `apps/tiffin-grab/app/(customer)/me/deliveries/delivery-calendar.tsx`
- Create: `apps/tiffin-grab/app/(customer)/me/deliveries/delivery-history.tsx`
- Test: `apps/tiffin-grab/app/(customer)/me/deliveries/__tests__/delivery-history-section.test.tsx`

**Interfaces:**
- Consumes: `myDeliveryHistory` + `myDeliveryActivity` (Tasks 6, 8), `deliveryDisplayStatus` (Task 7), `describeActivity` (Task 8), `Reveal` from `@/components/motion`, `formatEpoch` (used in wallet-section) for activity timestamps.

- [ ] **Step 1: Write the failing test**

Create `apps/tiffin-grab/app/(customer)/me/deliveries/__tests__/delivery-history-section.test.tsx` (jsdom). Mock `@/components/motion` (`Reveal` → passthrough, `Lottie` → stub) and the timezone provider. Render `<DeliveryHistory history={...} activity={...} today="2026-07-13" />` with:
- a past scheduled delivery → shows "Delivered".
- a past skipped delivery → shows "Skipped".
- an activity row of type "skipped" → shows the `describeActivity` label text.
- empty history + empty activity → renders nothing / a muted "No past deliveries yet." (assert that copy).

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/tiffin-grab && pnpm exec vitest run "app/(customer)/me/deliveries/__tests__/delivery-history-section.test.tsx"`
Expected: FAIL — cannot resolve `../delivery-history`.

- [ ] **Step 3: Implement the section component**

Create `apps/tiffin-grab/app/(customer)/me/deliveries/delivery-history.tsx` (`"use client"`):

```tsx
"use client";

import { Reveal } from "@/components/motion";
import { deliveryDisplayStatus } from "@/lib/deliveries/display-status";
import { describeActivity } from "@/lib/services/order-activity-describe";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { CustomerDelivery } from "@/lib/services/customer-deliveries.service";
import type { CustomerActivity } from "@/lib/services/customer-deliveries.service";

export function DeliveryHistory({
  history, activity, today,
}: { history: CustomerDelivery[]; activity: CustomerActivity[]; today: string }) {
  const tz = useTimezone();
  if (history.length === 0 && activity.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">No past deliveries yet.</p>;
  }
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold">History</h2>
      <Reveal.Group className="divide-y">
        {history.map((d) => (
          <Reveal key={d.publicId} className="flex items-center justify-between py-2.5">
            <span className="text-sm">{d.deliveryDate} · {d.planName}</span>
            <span className="text-muted-foreground text-xs">{deliveryDisplayStatus(d.status, d.deliveryDate, today)}</span>
          </Reveal>
        ))}
      </Reveal.Group>
      {activity.length ? (
        <div className="divide-y">
          {activity.map((a) => (
            <div key={a.publicId} className="flex items-center justify-between py-2">
              <span className="text-sm">{describeActivity(a)}</span>
              <span className="text-muted-foreground text-xs">{formatEpoch(a.createdAt, { mode: "datetime", timeZone: tz })}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
```

(Verify import paths: `@/lib/format/datetime` `formatEpoch` and `@/components/providers/timezone-provider` `useTimezone` are both used by `components/customer/home/wallet-section.tsx` — copy those exact paths.)

- [ ] **Step 4: Wire it in**

- `page.tsx`: compute `today` (the code already computes a `today` for the forward window — reuse it), a `since` = today − 30 days (mirror the existing date-math helper the page uses), load `myDeliveryHistory(userId, since, today)` and `myDeliveryActivity(userId)`, and render `<DeliveryHistory history={...} activity={...} today={today} />` below `<DeliveryCalendar>` (or pass into the calendar and render at the bottom — whichever matches the page's existing composition).

- [ ] **Step 5: Run it, verify it passes**

Run: `cd apps/tiffin-grab && pnpm exec vitest run "app/(customer)/me/deliveries/__tests__/delivery-history-section.test.tsx"`
Expected: PASS.

- [ ] **Step 6: Full verify gate**

Run: `cd /Users/lawbringr/IdeaProjects/realm-wt-2f09d8c4 && pnpm turbo typecheck && pnpm turbo test`
Expected: motion + new suites pass; note any PRE-EXISTING unrelated failures (live-DB/RabbitMQ/env — the same set observed in Slice 0) but confirm your new tests + the files you touched pass.

- [ ] **Step 7: Manual browser check**

Start the app (`/run` or `pnpm --filter tiffin-grab dev`), log in as a `user`. Confirm: (a) a waitlisted customer sees the WaitlistCard + scooter lottie on home and deliveries (not "no orders"); (b) the deliveries page shows a History section with derived "Delivered"/"Skipped" labels + an activity line after skipping a delivery.

- [ ] **Step 8: Commit**

```bash
git add "app/(customer)/me/deliveries/delivery-history.tsx" "app/(customer)/me/deliveries/page.tsx" "app/(customer)/me/deliveries/delivery-calendar.tsx" "app/(customer)/me/deliveries/__tests__/delivery-history-section.test.tsx"
git commit -m "feat(customer): delivery history section (past + activity log)"
```

---

## Self-Review

**Spec coverage:**
- A1 `myWaitlistedSubscriptions` → Task 1. ✓
- A2 `<WaitlistCard>` (waitlisted + pending variants, scooter lottie) → Task 2. ✓
- A3 three-way empty on home → Task 3; on deliveries + Browse CTA → Task 4. ✓
- B1 wire audit writes (actor from session, all 4 mutations, admin callers too) → Task 5. ✓
- B2 past deliveries → Task 6. ✓
- B3 derived "Delivered" label → Task 7. ✓
- B4 history section + activity timeline + reuse describe() → Tasks 8 (extract + read) + 9 (render). ✓
- Motion reuse (WaitlistCard scooter, EmptyState CTA, Reveal stagger) → Tasks 2/4/9. ✓
- No schema change / no enum change → held throughout (audit uses existing table). ✓

**Placeholder scan:** Live-DB service tests (Tasks 1, 5, 6, 8) intentionally delegate fixture/cleanup to "mirror the existing service test" rather than embedding guessed seed helpers — the repo's live-DB harness API isn't visible from the plan, and inventing it would be wrong code. Each such task names the file to read and gives the exact assertion core. This is a deliberate, flagged handoff, not a vague placeholder. All pure/jsdom tests (Tasks 2, 7, 9) and all implementation code are complete.

**Type consistency:** `WaitlistedSubscription` (Task 1) consumed identically in Tasks 2/3/4. `CustomerDelivery` (existing) reused in Task 6 + rendered in Task 9. `CustomerActivity` (Task 8) consumed in Task 9. `describeActivity` signature (Task 8) matches the admin `describe` shape it's extracted from. The four mutation signatures gain `actorId: bigint` consistently in Task 5 and every caller is updated there. `deliveryDisplayStatus(status, deliveryDate, today)` (Task 7) called with the same arg order in Task 9.

**Note on live-DB tests:** They require `DATABASE_URL` + `REDIS_URL` and run serially (`fileParallelism: false`). If the environment lacks a live DB, these tasks' tests cannot be verified locally — the implementer must flag that rather than delete/skip the assertions.
