# Slice 4 — Agent Order Management (CRM)

**Date:** 2026-06-22
**Status:** Approved, pre-implementation

## Summary

Agent-facing CRM for managing customer orders end to end. Covers four capabilities in one slice:

- **A. Orders list + detail** — browse/search/filter all orders; detail page shows customer, plan, schedule, status, payments.
- **B. Lifecycle actions** — activate-from-waitlist, cancel, pause/resume.
- **C. Agent meal-pick oversight** — view/edit a customer's coming-week dish picks from the order detail page.
- **D. Customer 360** — a customer record aggregating their orders + inquiry history + activity timeline.

## Terminology & roles

Use **"order"** everywhere — never "subscription". An `orders` row *is* the recurring meal commitment.

Roles (existing `users.role`):

- **admin** — full access.
- **member** — salesperson / agent. The dashboard's primary operator.
- **user** — customer (the "order people").

Page split by role:

- `/dashboard/users` (existing) lists **members/salespeople** (staff). Keeps the name "Users". Admin-only. Query scoped to staff roles (member/admin) if not already.
- `/dashboard/customers` (new) lists **customers** (role = `user`). Entry point for Customer-360.

## Architecture

### Routes (all under the `(dashboard)` group)

| Route | Purpose | Guard |
|---|---|---|
| `/dashboard/orders` | Orders list (filter + search) | `requireStaff` |
| `/dashboard/orders/[id]` | Order detail (summary + lifecycle + meals + activity) | `requireStaff` |
| `/dashboard/customers` | Customers list (role=`user`) | `requireStaff` |
| `/dashboard/customers/[id]` | Customer 360 | `requireStaff` |

### Layout precedent

Follows the existing **inquiry detail** pattern: stacked `SectionCard`s, typed controls, an activity timeline rendered with `ListRow` + `formatEpoch`. Reuses `PageShell`/`PageHeader`/`SectionCard`/`StatCard`/`Table`/`Badge` from `@/components/ds` and `@/components/ui`.

## Data model

`db/schema/orders.ts` + hand-written migration (drizzle-kit needs a TTY here — author SQL + `_journal.json` entry by hand, per known debt; do NOT rebaseline headlessly).

1. **`orderStatus` enum** — add `paused`:
   `pending | active | waitlisted | cancelled | paused`.

2. **`orders`** — add nullable pause-window columns:
   - `pausedFrom date` (nullable)
   - `pausedUntil date` (nullable)

   Set when `status = paused`; cleared on resume. The window drives both delivery suppression and end-date extension (see Pause semantics).

3. **New table `order_activities`** (mirrors `inquiry_activities`):
   - `...baseColumns("oac")`
   - `orderId bigint` FK → `orders.id`, `onDelete: cascade`, not null
   - `type` enum **`order_activity_type`**: `created | status_change | paused | resumed | cancelled | activated | meal_pick | note`
   - `note text` (nullable)
   - `fromStatus order_status` (nullable)
   - `toStatus order_status` (nullable)

## Pause semantics (B)

Fixed pause window. Agent enters a `from` + `until` date when pausing.

- Status → `paused`; `pausedFrom`/`pausedUntil` set.
- **Delivery dates within `[from, until]` are suppressed and the tail auto-extends** so the customer still receives `durationWeeks × deliveryDays.length` deliveries total.
- Resume → status `active`, clears `pausedFrom`/`pausedUntil`.

**Implementation:** extend `subscriptionDeliveryDates` (in `lib/menu/delivery-dates.ts`) with an optional `pauseWindow?: { from: string; until: string }`. When walking forward day-by-day, a matching weekday that falls inside the window is **skipped without being counted** — the loop keeps walking until it has collected `total` delivery dates. The end-date extension therefore falls out of the existing counting logic; no separate "extended end" column is needed. The loop guard must widen to accommodate the skipped span.

This function is pure and already unit-tested — the pause window is an additive, backward-compatible parameter (absent = today's behavior).

### Transition rules

- `waitlisted → active` (activate)
- `active → paused` (pause; requires valid window, `from <= until`)
- `paused → active` (resume)
- any non-cancelled → `cancelled`
- **Illegal:** pausing a `pending`/`waitlisted`/`cancelled` order; resuming a non-paused order. Mutators throw `ValidationError`.

Every transition writes an `order_activities` row with `fromStatus`/`toStatus`.

## Order service (`lib/services/orders.service.ts` — extend)

Pure data functions; staff authorization enforced at the server-action layer (`requireStaff`).

- `listOrders({ status?, search? })` — flat list. `status` filters by `orderStatus`; `search` matches customer `fullName` / phone / `deploymentId` (case-insensitive). Returns summary rows: customer, plan key, status, startDate, total, createdAt. Newest-first. No pagination this slice.
- `readOrder(publicId)` — full detail incl. plan/frequency/mealSize labels + payments.
- `listOrderActivities(orderId)` — timeline rows.
- Lifecycle mutators, each logging an `order_activities` row in the same tx:
  - `activateOrder(publicId)` — waitlisted → active
  - `cancelOrder(publicId)` — → cancelled
  - `pauseOrder(publicId, { from, until })` — active → paused, validates window
  - `resumeOrder(publicId)` — paused → active, clears window

## Pages

### `/dashboard/orders` (list)

Status filter chips (all / pending / active / waitlisted / paused / cancelled) + search box. Table columns: customer, plan, status badge, start date, total. Mirrors the Inquiries list. Rows link to detail.

### `/dashboard/orders/[id]` (detail)

Four `SectionCard`s:

1. **Summary** — customer, plan, schedule (start / duration / delivery days / slots), status badge, total, payments.
2. **Lifecycle** — typed controls: activate / cancel / pause (with typed `from`+`until` date inputs) / resume. Per **TD-3**, date inputs are typed date controls, never free-text. Controls render conditionally on current status.
3. **Meals** — embedded coming-week meal grid for this order (see Meals oversight).
4. **Activity** — timeline from `order_activities` (`ListRow` + `formatEpoch`).

### `/dashboard/customers` (list)

Role = `user`. Columns: name, contact (phone/email), # orders, latest order status. Search by name / phone / email.

### `/dashboard/customers/[id]` (Customer 360)

- Profile (name, contact).
- Their orders (`orders.userId = customer`).
- Inquiry history matched by **case-insensitive phone OR email equality** (inquiries have no `userId` FK).
- Merged activity timeline (order activities + inquiry activities, chronological).

**Known edge:** anonymous phone-only orders with no `userId` won't roll up to a customer record. Documented, not solved this slice.

## Meals oversight refactor (C)

- Extract the grid-building logic out of `meals/page.tsx` into a reusable server helper `buildMealsGrid(order, { timezone, cutoffHour })` in `lib/menu/`. Returns the `GridCell[]` + view data.
- `meals/page.tsx` calls it with the logged-in customer's own active order (behavior unchanged).
- `/dashboard/orders/[id]` Meals section calls it with the target order.
- Reuse the existing `pickDish` server action — already staff-authorized via `isStaff` in `meals/actions.ts`. The `MealsGrid` client component is unchanged.

## Navigation (`components/dashboard/app-sidebar.tsx`)

Add to the **Operations** section (`roles: ["admin", "member"]`):

- **Orders** → `/dashboard/orders`, `PackageIcon`
- **Customers** → `/dashboard/customers`, `UsersIcon` (or similar)

"Users" stays in Administration (admin-only, = salespeople/members).

## Testing (vitest)

Run from `apps/web` with `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin"` prefix; `delivery-dates` test runs from `packages/commons` if the function lives there (it currently lives in `apps/web/lib/menu`). Session-importing tests must `vi.mock("@/lib/auth", () => ({ auth: async () => null }))` + dynamic `await import(...)`.

- **`orders.service` lifecycle**: each transition logs the correct `order_activities` row with right from/to status; illegal transitions throw (pause non-active, resume non-paused, `from > until`).
- **`subscriptionDeliveryDates` pause window**: dates inside `[from, until]` skipped; total delivery count preserved; tail extends past the window; absent window = unchanged behavior.
- **`listOrders`**: status filter + case-insensitive search.
- **Customer-360 matching**: inquiries matched by case-insensitive phone/email.

Tests wipe the dev DB — reseed after: `pnpm db:seed && db:seed:catalog && db:seed:menu && db:seed:admin`.

## Process

superpowers `writing-plans` → `subagent-driven-development` (fresh implementer + task-reviewer per task, fix loop) → final whole-branch review on opus → `merge --no-ff` to `main` + push + delete branch. SDD ledger at `.superpowers/sdd/progress.md`. Plain commits, **no** `Co-Authored-By` trailer. Read `node_modules/next/dist/docs/` before framework code (modified Next.js 16).

## Tech-decision alignment

- **TD-1** shared code → `@tiffin/commons*`. The pause-window param on `subscriptionDeliveryDates` is a candidate to migrate into `@tiffin/commons` alongside other zoned-time helpers if it isn't already there.
- **TD-3** typed admin controls — lifecycle date inputs are typed date controls.
- **TD-4** time semantics — pause window dates are delivery-anchored (`America/Toronto`), epoch-ms / ISO-date storage consistent with existing cutoff logic.
</content>
</invoke>
