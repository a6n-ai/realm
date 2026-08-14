# Puchkaman customer accounts, roles, and loyalty — design

Date: 2026-08-14
Status: approved for planning

## Goal

Give puchkaman the same three-role identity model tiffin-grab has
(`admin` / `member` / `user`), let customers sign in to see their past and
current orders, run the same coins/loyalty program, and create linked staff
accounts when employees are pulled from Clover.

## Current state

Established by reading the repo, not assumed:

- **Customer rows already exist.** `lib/customers/upsert-customer.ts:24-57`
  inserts a `users` row (`role: "user"`, `passwordSet: false`) for every
  checkout, called inside the order transaction at
  `lib/services/orders.service.ts:716`. `orders.user_id` and
  `ledger_entries.user_id` are already populated.
- **Customers cannot hold a session.** `lib/auth/index.ts:29-44`
  (`assertSessionAllowed`, wired as a `databaseHooks.session.create.before`)
  rejects any user whose `role === "user"`.
- **Roles exist on both sides.** `packages/commons/src/enums.ts:1` defines
  `admin | member | user`; `db/schema/auth.ts:13` has the matching pgEnum.
  `lib/auth/permissions.ts:41-48` already grants `member` real permissions
  (`product:read`, `order:[read,write]`, `finance:read`).
- **`member` is unreachable in the UI.**
  `app/(dashboard)/dashboard/layout.tsx:21` hard-redirects anyone whose role
  is not `admin`.
- **Guest order visibility already works.** `@realm/order-tracking` serves
  `/track/[publicId]` with a phone-derived PIN
  (`packages/order-tracking/src/pin.ts:13-31`), and
  `packages/order-tracking/src/access.ts:40-56` already grants access without
  a PIN when the viewer's id equals `subject.ownerUserId`.
- **Clover employees are disjoint from auth.**
  `lib/sync/clover-employees-sync.service.ts` writes only the `employees`
  table (`db/schema/employees.ts`); `employees.role` is free text, unrelated
  to the `user_role` enum.
- **Wallet is entirely app-local to tiffin-grab.** Schema
  `apps/tiffin-grab/db/schema/wallet.ts`, service
  `lib/services/wallet.service.ts`, admin UI
  `app/(dashboard)/dashboard/wallet/*`, customer UI
  `components/customer/wallet/*`. Nothing extracted.

### Two defects found while mapping

1. **`users.role` defaults to `member`.** `db/schema/auth.ts:39` and the
   better-auth `additionalFields` default at `lib/auth/index.ts:97-103` both
   default to `member` — a staff role. Any self-service sign-up added on top
   of the current defaults mints staff accounts. Must be fixed before OTP
   sign-in is enabled.
2. **`upsertCustomer` overwrites profile fields on email conflict.** It
   COALESCE-updates `name`/`phone` for an existing row. Once accounts are
   real, a stranger entering your email at checkout rewrites your profile.

## Non-goals

- Syncing Clover *customer* records into `users`.
- Passwords as the primary customer credential.
- Any change to how Clover owns pricing and tax.
- Subscription/delivery features from tiffin-grab.

## Slice 1 — Customer identity and order history

### Auth

- `lib/auth/index.ts` `assertSessionAllowed`: remove the `role === "user"`
  rejection. Keep the `status !== "active"` gate unchanged.
- Change the role default to `Role.USER` in two places: the better-auth
  `user.additionalFields.role` default, and the `users.role` column default
  (migration). Both `inviteUser` (`lib/services/users-invite.ts:45`) and
  `upsertCustomer` pass `role` explicitly, so neither regresses.
- Enable `emailOTP` sign-in for customers. The plugin is already configured
  (6 digits, 600s TTL, 5 attempts, hashed). `emailAndPassword.disableSignUp`
  stays `true`: passwords remain invite-only, and a customer acquires one
  only by choosing to set it later.
- The OTP `sign-in` flow creates a user when the email is unknown — that is
  the customer registration path, and it is why the role default must be
  corrected first. Staff may also sign in by OTP; nothing about their
  invite-issued role changes.
- Customers signing in by OTP against an existing guest row need no
  migration — their `orders` already carry their `user_id`.

### Routes

New `(customer)` route group using `<CrmShell>` from `@realm/crm`, gated
`role !== "user"` → `/dashboard` (mirroring
`apps/tiffin-grab/app/(customer)/layout.tsx:19-20`), plus the
`status === "active"` re-check.

- `/me` — home: current orders, entry points
- `/me/orders` — history, ongoing first
- `/me/orders/[publicId]` — detail
- `/me/account` — profile and security, role-gated nav

`proxy.ts`: add `/me/:path*` to the matcher, redirecting to
`/login?callbackUrl=…` when the session cookie is absent. Cookie presence
only, as with `/dashboard` — the real gate stays in the layout.

### Order detail reuses order tracking

`/me/orders/[publicId]` calls the same `auth.api.getOrderTrackingGrant` +
`loadTrackedOrder` + `TrackingView` path as `/track/[publicId]`. Because
`decideTrackingAccess` already grants an owner without a PIN, the logged-in
case needs no new authorization logic and no second order-detail renderer.

### Checkout linking

`orders.service.ts:716`: when a session exists, attach `session.user.id`
directly instead of going through the email upsert.

### Profile-overwrite guard

`upsertCustomer`'s `onConflictDoUpdate` must not overwrite `name`/`phone`
when the target row has `passwordSet` or `email_verified` set.

## Slice 2 — Clover employees to users, and making `member` real

> Revised 2026-08-14 after slice 1. Slice 1 discovered that all ~40 dashboard
> pages call `requireAdmin`, which *throws*, so admitting `member` produced an
> unhandled 500. Slice 1 routed `member` to `/no-access` as an interim. Syncing
> Clover employees into `member` accounts is pointless while that holds, so the
> permission audit moves into this slice.

### Making `member` a usable role

The permission map already decides who may do what
(`lib/auth/permissions.ts`): `member` holds `product:read`,
`order:[read, write]`, `finance:read`. The audit applies that map rather than
re-litigating it per page.

Measured surface: 89 `requireAdmin` calls across 36 files under
`app/(dashboard)/dashboard`, plus every route under `app/api/orders` and
`app/api/products`. Only ~10 of those files change; the rest stay admin-only.

| Surface | Guard | `member` |
|---|---|---|
| `orders/page.tsx`, `orders/[id]/page.tsx` | `order:["read"]` | yes |
| `products/page.tsx`, `products/[id]/page.tsx` | `product:["read"]` | yes, read-only |
| `finance/layout.tsx`, `finance/ledger`, `finance/transactions` | `finance:["read"]` | yes |
| `account/page.tsx` | any staff session | yes — today `requireAdmin` locks a member out of their own account page |
| `dashboard/page.tsx` (home) | any staff session; each card gated by its own permission | partial |
| `settings/*`, `notifications/*`, `logs`, `clover/*`, `settings/users` | unchanged `requireAdmin` | no |

API routes carry their own guards and are audited alongside the pages, because
a page-level guard does nothing for a direct `fetch`:

- `app/api/orders/**` — reads `order:["read"]`, mutations `order:["write"]`.
- `app/api/products/**` — reads `product:["read"]`; every write, sync, delete,
  and Clover-link route stays `product:["write"]` or `product:["sync"]`, which
  `member` does not hold.

Two slice-1 decisions reverse, now that `member` has somewhere to land:
`landingPathFor("member")` returns `/dashboard`, and the dashboard layout admits
`member` again. `/no-access` stays for any future role with no pages.

`components/dashboard/app-sidebar.tsx` must filter its items by permission.
Without it a member sees nav pointing at pages that now correctly 403 — the same
dead-end slice 1 removed, in a quieter form.

### Linking Clover employees to users

- Add `employees.user_id` → `users.id`, nullable, unique.
- `clover-employees-sync.service.ts` upserts a `users` row for each Clover
  employee **that has an email**: `role: "member"`, no credential,
  `passwordSet: false`, `status: "active"`. Employees without an email get no
  user row and no link.
- **Role is set on create only.** A subsequent sync never rewrites the role
  of an existing user, so a manual promotion to `admin` survives.
- **The sync sends no email.** It creates the row and the link; an admin then
  clicks Invite to mail the OTP. Sync stays idempotent and silent, so re-running
  it — or scheduling it — never mails anyone.
- Employees are keyed on `clover_employee_id`; users are keyed on email. That
  mismatch is why an employee with no email gets no user row: there is no key
  to match or create on.
- Deactivation stays as-is: the sync marks the `employees` row inactive. It
  does not change `users.status` — staff access is revoked deliberately, not
  by a POS side effect.
- `/dashboard/settings/users`: add a "Sync from Clover" action behind
  `requirePermission({ staff: ["invite"] })`.
- `usersService.listAll()` (`lib/services/users.service.ts:30-32`) is an
  unfiltered `select * from users` and already lists guest customers
  alongside staff. Add a role facet using the existing `FacetDef` /
  `parseFilterState` framework, defaulting to staff roles.
The users list also moves onto the shared facet framework. It is a raw
`<Table>` today with no filters, no search, and no pagination, over an
unpaginated `select *` — which already mixes guest customers in with staff and
degrades with every order placed.

## Slice 3 — Extract `@realm/wallet`

`wallet_ledger.order_id` references each app's local `orders` table, and each
app needs its own event catalog, so the schema ships as a factory rather than
fixed tables:

```ts
createWalletTables({ users, orders, appEvent, ledgerDirection })
```

tiffin-grab passes its existing `app_event` pgEnum, so no column type
changes and no data migration.

Package contents:

- `packages/wallet/src/schema.ts` — the table factory (`wallet_ledger`,
  `event_payout`, `coin_rate`), built on `baseColumns` from `@realm/database`
- `packages/wallet/src/service.ts` — `WalletService`: `balance`,
  `ledgerPage`, `award`, `redeem`, `recentTransactions`, `earnSpendTotals`,
  `moneyValue`, `activeRate`

**Revised 2026-08-14: the UI does NOT move.** Mapping the code before
planning showed the wallet components are tied to tiffin-grab-only infra —
`WalletHero` needs `@/components/motion` (Lottie plus a coin-burst asset),
`WalletLog` pulls in six app-local modules (the `ds` barrel, reui facet
filters, datetime formatting, a timezone provider), and the admin
`payout-grid` imports `../discounts/controls`. Extracting them means either
dragging that infra into the package or rewriting each component to take it
as slots. Puchkaman's customer surfaces are brutalist rather than
CRM-styled, so it would likely not use the components unchanged anyway.
This repo's own rule is that code stays app-local until a second client
proves it shared: the money logic is proven, the presentation is not.
Puchkaman writes its own wallet UI in slice 4.

Consequence: `@realm/wallet` is **server-only**, so it is NOT added to
`transpilePackages` in either app — matching `@realm/auth` and the other
server-only packages.

`appEvent` also stays app-local. It lives in tiffin-grab's `wallet.ts`
today but is the app-wide event catalog — `db/schema/notifications.ts`
imports it from there — and puchkaman already has its own `app_event` enum
with a different value set. Two different enums share the Postgres type name
`app_event`, which is precisely why the tables must come from a factory
rather than be shared as values. `@realm/notifications` already solves this
exact problem with `makeNotificationTables`; follow that precedent rather
than inventing a second shape.

`redeem` writes a row into the app's own money `ledger_entries` table, whose
shape differs per app. That write is injected as a dependency rather than
imported, so the package never references an app-local table.

Invariants preserved verbatim from the current implementation: the unique
`wallet_earn_idempotent_idx` on `(source_type, source_id, event_type)`; the
`SELECT … FOR UPDATE` per-user lock in `redeem`; the cap of `currencyValue`
at `order.total` applied both before and after rounding; `award` no-ops when
the payout row is disabled or zero.

Acceptance gate: tiffin-grab's five existing wallet test files pass
unchanged. This is a behavior-identical refactor.

## Slice 4 — puchkaman wallet wiring

### Schema

Migration adding the wallet tables plus a puchkaman `app_event` enum:
`order_created`, `order_paid`, `order_completed`, `order_cancelled`,
`refund_issued`, `signup`, `manual_adjustment`. Earn rates live in
`event_payout`, so enabling a new earning event is a settings change rather
than a code change.

### Earning

`walletService.award` fires on payment verified, from both paths that can
confirm a payment: the Clover webhook (primary) and the admin "Check status"
fallback. Awards are deliberately deferred until verification. The
idempotency index makes the double path safe — whichever confirms first wins,
the second is a no-op.

Award failures are caught and logged, never allowed to fail the order, matching
`orders.service.ts:399,485,933` in tiffin-grab.

### Spending

Redemption requires a session; guests see a "sign in to use coins" prompt at
checkout.

**Coins redeem as a Clover discount line on the Clover order, not as a local
deduction.** `payOrder` charges the Clover order's total, so a discount
recorded only in local tables produces a quoted amount that differs from the
amount charged. The existing `coupon_code` discount path already writes a
Clover discount and is the mechanism to reuse. Clover applies discounts
pre-tax and recomputes tax on the grouped net, so the final total comes back
from Clover rather than being predicted locally.

`redeem` writes both the `wallet_ledger` debit and the matching
`ledger_entries` discount row in one transaction, as today.

Note: tiffin-grab's `redeem()` has no production call site — puchkaman is the
first real consumer, so this slice carries the spend-path risk for both apps
and needs integration tests against a live DB.

### UI

- Admin: Settings → Wallet (payout grid, coin rate), both behind
  `requireAdmin`. The existing Finance → Ledger already covers money.
- Customer: `/me/wallet` — balance, earn/spend totals, faceted coin history.

## Sequencing

1. Slice 1 — unblocks everything customer-facing
2. Slice 2 — independent of 1, small
3. Slice 3 — refactor, gated on tiffin-grab tests
4. Slice 4 — depends on 1 and 3

## Testing

- Auth admission: `role === "user"` with `status active` gets a session;
  `inactive`/`suspended`/`deleted` still rejected at every role.
- Role default: an OTP sign-up creates `role === "user"`, never `member`.
- `/me/orders/[id]`: owner sees the order with no PIN; a signed-in
  non-owner does not.
- `upsertCustomer`: a guest checkout using a registered customer's email does
  not overwrite that account's name or phone.
- Clover sync: idempotent across two runs; a user manually promoted to
  `admin` stays `admin` after a re-sync; an employee with no email creates no
  user.
- Wallet extraction: tiffin-grab's existing wallet suite passes unchanged.
- Redemption: concurrent redeems cannot overdraw; the amount charged by
  Clover equals the amount quoted after a coin discount.

## Verify contract

`pnpm turbo typecheck && pnpm turbo test` after each slice. Watch the two
things `tsc` cannot catch when touching the new client components and the
extracted wallet UI: a stripped `"use client"` directive, and a client symbol
demoted from a named export.
