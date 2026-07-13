# Customer Deliveries Hub + Waitlist Fix — Design (Slice 4)

**Date:** 2026-07-13
**App:** `apps/tiffin-grab`
**Status:** Approved, ready for implementation plan
**Program:** Customer-experience revamp, Slice 4 of 6 (see `2026-07-12-customer-motion-foundation-design.md` for Slice 0; motion primitives from Slice 0 are consumed here).

## Problem

Two related gaps on the customer deliveries surface:

1. **"Subscription created but shows no orders."** A customer whose postal code is
   out of a served zone gets an order with status `waitlisted`
   (`orders.service.ts:253`), which never materializes deliveries
   (`orders.service.ts:288` only materializes `active`). The logged-in customer's
   home and deliveries pages both read `myActiveSubscriptions`
   (`lib/services/customer-deliveries.service.ts:41`), filtered to
   `["active","paused"]` — so the waitlisted order is **excluded**, and the
   customer sees the identical **"No active subscriptions yet."** as a brand-new
   user. Waitlist state is only shown **pre-login** (checkout + `activate` pages).
   The order silently vanishes in-app.

2. **No delivery history/logs.** The deliveries view shows only a forward 14-day
   window. There is no past-delivery history and no per-delivery event trail. The
   `order_activities` table already has a `deliveryId` FK and enum values
   `skipped` / `unskipped` / `delivery_address_changed` (`db/schema/orders.ts`),
   but **nothing writes them** — skip/unskip/address-override mutate the delivery
   row silently. The audit scaffold is dead.

### Ground truth (from codebase map, 2026-07-13)

- Deliveries page: `app/(customer)/me/deliveries/{page.tsx,delivery-calendar.tsx,actions.ts}`.
  Grouped list (one section per subscription), forward `WINDOW_DAYS` (14) window,
  read-only (never materializes). Empty state = bare
  `<EmptyState icon={CalendarDaysIcon} message="No active subscriptions yet." />`
  (`delivery-calendar.tsx:305`), no CTA.
- Home: `app/(customer)/me/page.tsx` + `components/customer/home/subscription-section.tsx`.
  Zero-active empty state at `subscription-section.tsx:127` = "No active
  subscriptions yet." + a working `<Link href="/subscribe">Browse plans</Link>`.
- `myActiveSubscriptions` (`lib/services/customer-deliveries.service.ts:25`,
  filter line 41) = `inArray(orders.status, ["active","paused"])`.
- `order_status` enum: `pending · active · waitlisted · cancelled · paused · completed`.
- `delivery_status` enum: `scheduled · paused · skipped · cancelled` — **no
  `delivered`**; a completed delivery still reads `scheduled`. No
  delivery-confirmation actor exists.
- `order_activities` (`db/schema/orders.ts`): audit table with
  `order_activity_type` incl. `skipped`/`unskipped`/`delivery_address_changed`
  and a `deliveryId` column — **provisioned but never written** for delivery
  events (only `created`/`activated`/`cancelled`/`paused`/`resumed` are written,
  at order level).
- Admin parallel: `app/(dashboard)/dashboard/orders/[id]/` renders a
  `DeliveriesPanel` (all-status table via `listDeliveries`) and an "Activity"
  `SectionCard` via `listOrderActivities` + a `describe()` label map — the
  closest existing "history log" to mirror for the customer.
- `waitlisted → active` only via admin `ordersService.activate()`
  (`orders.service.ts:521`); no automatic zone-open trigger. (Auto-activation is
  explicitly OUT of scope — a future slice.)

## Decisions (locked)

- **Waitlist fix:** surface waitlisted (and pending) orders in-app with a
  **distinct waitlist state + order summary**, on both home and deliveries.
- **Delivery logs:** **wire the dormant `order_activities` delivery events** +
  show **past deliveries** + a **per-delivery activity timeline**.
- **History placement:** a **"History" section on the deliveries page** (Upcoming
  + History on one screen). No new route.
- **Delivered label:** past + `scheduled` + not-skipped → **"Delivered"
  (derived)**. No new status, no schema `delivered` value, no confirmation actor.
- **No auto-activation** of waitlisted orders (out of scope).
- **No DB schema change** — `order_activities` already supports delivery events.

## Design

### Part A — Waitlist / "no orders" fix

**A1. New read `myWaitlistedSubscriptions(userId)`** in
`lib/services/customer-deliveries.service.ts`:
- Returns orders with `inArray(orders.status, ["waitlisted","pending"])` for the
  user, each with a summary: plan name, meal size, schedule (days/week or
  frequency label), and the order's postal code/address.
- Leave `myActiveSubscriptions` **unchanged** (active/paused only — they drive
  materialized deliveries). Waitlisted/pending have no deliveries by design.
- IDOR: scoped by `orders.userId = userId`.

**A2. `<WaitlistCard>`** — new component
`components/customer/home/waitlist-card.tsx` (`"use client"`):
- Renders the `delivery-scooter` Lottie (Slice 0 `<Lottie>` / manifest), a
  heading "You're on the waitlist", the order summary (plan · size · schedule),
  the postal code with "not served yet", and copy "We'll email you when we reach
  your area." No action button required (matches pre-login copy).
- `pending` orders render a lighter "Processing your subscription…" variant of
  the same card (distinguished by status). Copy differs; layout shared.

**A3. Three-way empty logic** on both surfaces:
- `subscription-section.tsx` (home) and `delivery-calendar.tsx` (deliveries):
  1. active/paused subscriptions exist → current UI.
  2. else waitlisted/pending exist → `<WaitlistCard>`.
  3. else (truly none) → current "No active subscriptions yet." + Browse plans
     CTA. **Also add the Browse CTA to the deliveries empty state** (today it's a
     bare `EmptyState` with no link).
- Home `page.tsx` and deliveries `page.tsx` load `myWaitlistedSubscriptions`
  alongside the existing reads and pass it down.

### Part B — Delivery logs / history

**B1. Wire the dormant audit** — in `lib/services/deliveries.service.ts`, the
functions behind the customer skip/unskip/address actions write an
`order_activities` row inside their existing transaction:
- skip → `type: "skipped"`, unskip → `"unskipped"`,
  setAddress/clearAddress → `"delivery_address_changed"`.
- Each row sets `deliveryId`, `orderId`, and `created_by` **from the session
  actor** (threaded from `me/deliveries/actions.ts`), never from input
  (AGENTS.md audit rule). Admin-side skip/address (`dashboard/orders/[id]`) that
  route through the same service functions get the same audit rows for free —
  acceptable and desirable (was missing before).

**B2. Past deliveries** — new read `myDeliveryHistory(userId, since)` (or widen
the window loader) returning past deliveries within a bounded lookback (default
30 days, matching the existing forward-window clamp pattern). Kept separate from
the forward `myDeliveries` so upcoming logic stays clean.

**B3. Derived status label** — a pure helper (in `calendar-constants.ts` or a new
`delivery-status.ts`):
- future + `scheduled` → "Scheduled"
- past + `scheduled` + not skipped → **"Delivered"** (derived; comment marks the
  assumption)
- `skipped` → "Skipped", `paused` → "Paused", `cancelled` → "Cancelled".

**B4. History section** on the deliveries page:
- Below the "Upcoming" list, a "History" section rendering past deliveries
  (derived labels) interleaved with the activity timeline.
- **Activity timeline:** a customer-scoped read `myDeliveryActivity(userId, opts)`
  joining `order_activities` → `orders` on `orders.userId = userId`
  (IDOR-gated), ordered `createdAt` desc, bounded limit. Rendered by **reusing
  the admin `describe()` label map** (extract/share it if it currently lives in
  the dashboard tree) so labels stay consistent (e.g. "Skipped by you",
  "Address changed"). Order-level events (created/activated/paused) and the
  newly-wired delivery events both appear.

### Motion (Slice 0 reuse — no new deps)

- `<WaitlistCard>` uses the `delivery-scooter` Lottie.
- Empty state (truly none) uses `<LottieEmptyState animation="empty-box" …>` with
  the Browse CTA as its `action`.
- `<Reveal.Group>` staggers the Upcoming and History lists.
- Past "Delivered" rows get a subtle success accent (existing `--color-ok` /
  `success-check` optional, keep light).

## Non-goals (deliberately out)

- Auto-activating waitlisted orders when a zone opens (needs a zone-open trigger;
  own slice).
- A real `delivered` status / `delivery_events` table / mark-delivered flow (no
  confirmation actor exists).
- The cutoff countdown banner (Slice 2).
- Customer meal picking (Slice 2).
- Any `order_status`/`delivery_status` enum change.

## Testing / verify contract

- **Service tests** (vitest, live-DB pattern per repo, scope cleanup to own
  identifiers per the integration-isolation rule):
  - `myWaitlistedSubscriptions` returns waitlisted/pending, excludes
    active/paused/cancelled/completed.
  - skip / unskip / setAddress / clearAddress each write exactly one
    `order_activities` row with correct `type`, `deliveryId`, and session
    `created_by`.
  - `myDeliveryHistory` returns past deliveries within the lookback, none future.
  - `myDeliveryActivity` returns only the caller's activity (IDOR).
- **Component tests** (jsdom):
  - Three-way empty: active → list; waitlisted → `<WaitlistCard>` with summary;
    none → Browse CTA. On both home and deliveries.
  - Derived label helper: past-scheduled → "Delivered"; skipped → "Skipped";
    future → "Scheduled".
- `pnpm turbo typecheck && pnpm turbo test`.
- Eyeball (tsc can't catch): `"use client"` on new client components; the wired
  activity writes actually fire from the customer action path (drive skip on a
  real delivery, confirm a row appears).

## Risks

- **Pricing/totals:** none touched — this slice is read + audit only; no amount
  computation. (Pricing stays server-side per AGENTS.md, unaffected.)
- **Admin double-write:** wiring audit into shared `deliveries.service.ts`
  functions means admin skip/address now also writes activity rows. Intended;
  verify no existing admin test asserts *absence* of activity rows.
- **Derived "Delivered" accuracy:** it's an assumption (date passed, not
  skipped). Acceptable per decision; the label helper isolates it so a real
  status can replace the derivation later without touching call sites.
