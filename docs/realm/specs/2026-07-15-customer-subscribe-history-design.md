# Customer Subscribe History — Design (Slice 5, narrowed)

**Date:** 2026-07-15
**App:** `apps/tiffin-grab`
**Status:** Approved, ready for implementation plan
**Program:** Customer-experience revamp, Slice 5 (final). Consumes Slice-0 motion + the existing status badge.

## Goal

When a **logged-in** customer opens `/subscribe`, show their **existing + past subscriptions** above the wizard ("You already have…" → "Start a new plan"). Anonymous visitors see the wizard unchanged.

## Coordination note (why this slice is narrow)

Slice 5 originally also covered the **country-code picker**. That is **already shipped by a concurrent session** and fully merged to main: checkout (`PhoneInput` + `defaultCountry`), login (Phone/Email tabs + country selector), signup, and profile all use the country-selector fed by the admin `app.default_country` setting; `wt/93f3e85b` has 0 commits ahead of main (nothing in-flight). **This slice does NOT touch any country-code / phone-input code.** The only untouched piece was the subscribe history — that's all this builds.

## Ground truth (codebase map, 2026-07-15)

- `app/(public)/subscribe/page.tsx` — a public, `force-dynamic` page that loads the catalog and renders `<Wizard>`. Fully anonymous today (no session read). It CAN read the session in its server component (`currentUserId()` reads cookies).
- Slice-4 reads (`lib/services/customer-deliveries.service.ts`): `myActiveSubscriptions(userId)` (active/paused, `Subscription` shape) + `myWaitlistedSubscriptions(userId)` (waitlisted/pending, `WaitlistedSubscription` shape with `planName`/`mealSizeName`/`daysPerWeek`). **No read covers cancelled/completed** ("past") subscriptions.
- Status badge: `components/ds` `order-status-badge` maps `order_status` → label/tone (waitlisted→warn, etc.).
- `orders` has `userId`, `planId`, `mealSizeId`, `frequencyId`, `status`, `createdAt`; `plans.name`, `mealSizes.name`, `deliveryFrequencies.daysPerWeek` (joins used by `myWaitlistedSubscriptions`).

## Decisions (locked)

- Show **current + past** — all of the customer's subscriptions across every status (active/paused/waitlisted/pending → "Current"; cancelled/completed → "Past").
- **One new uniform read** (`mySubscriptionsSummary`) rather than juggling the two existing per-status reads + a third — a single shape the component groups.
- **No DB schema change. No country-code / phone code touched.**

## Design

### A. Backend — one new read (no schema change)
- **`mySubscriptionsSummary(userId: bigint): Promise<SubSummary[]>`** in `customer-deliveries.service.ts`:
  - `SubSummary = { publicId: string; planName: string; mealSizeName: string; daysPerWeek: number; status: string; createdAt: number }`.
  - Select all `orders` for `userId` (any status), joined to `plans`/`mealSizes`/`deliveryFrequencies` (mirror `myWaitlistedSubscriptions`'s joins), ordered `createdAt desc`.
  - Scoped by `orders.userId = userId` (IDOR — inherently user-owned).

### B. Component (`components/customer/subscribe/`)
- **`<ExistingSubscriptions>`** (`"use client"`), props `{ subs: SubSummary[] }`:
  - Split into **Current** (`active`/`paused`/`waitlisted`/`pending`) and **Past** (`cancelled`/`completed`). Render each non-empty group under a small heading.
  - Each row: `planName · mealSizeName · daysPerWeek days/wk` + an `<OrderStatusBadge status={sub.status}/>`.
  - `Reveal.Group` stagger. `subs.length === 0` → render nothing (page shows wizard only).

### C. Wire into `subscribe/page.tsx`
- Add `currentUserId()`. If non-null → `mySubscriptionsSummary(userId)` → render `<ExistingSubscriptions subs={...}/>` above the wizard, plus a "Start a new plan" sub-heading before `<Wizard>`. If null (anonymous) or empty → current behavior (wizard only).
- Keep `force-dynamic` (already set). Load the summary in parallel with the catalog.

### D. Motion (Slice 0 reuse)
`Reveal.Group` on the subscription rows; reduced-motion honored. No new deps.

## Non-goals
- Any country-code / phone-input change (done by the concurrent session).
- Reorder / clone / "subscribe again from a past plan" flow (display only).
- Any wizard change, catalog change, or DB schema change.
- Admin create-account phone input (out of this narrowed scope; flag separately if genuinely missing).

## Testing / verify contract
- **Service test** (live-DB, Slice-4 harness): `mySubscriptionsSummary` returns the user's orders across statuses (seed active + cancelled), user-scoped (user B's orders never returned), newest first.
- **Component test** (jsdom): `<ExistingSubscriptions>` groups current vs past correctly, renders plan/size/status per row, and renders nothing when `subs` is empty.
- `pnpm turbo typecheck && pnpm turbo test`.
- Eyeball: logged-in `/subscribe` shows the summary above the wizard; anonymous `/subscribe` is unchanged; a user with cancelled + active subs sees both groups.

## Risks
- **`SubSummary.status` is a raw enum string** — `OrderStatusBadge` must accept it (it maps the `order_status` values); confirm it handles all six.
- **IDOR** — the read is user-scoped; the page passes `currentUserId()`, never client input.
- Low blast radius: one new read + one component + a ~10-line page change; no schema, no shared-code edits, no overlap with the concurrent country-code work.
