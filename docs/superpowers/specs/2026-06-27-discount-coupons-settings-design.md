# Discounts & Coupons — Settings & Governance (Design Spec)

Date: 2026-06-27
Status: Proposed
Slice scope: Discount/coupon **settings + governance + application plumbing**. NOT the customer-facing
coupon dashboard (that is a later slice).

---

## 1. Problem, Goals, Non-Goals

### Problem
The pricing engine already exposes an `adjustments[]` hook (`apps/web/lib/pricing/engine.ts`) that is
always empty today. The business needs (a) admin-managed coupons applied in both the customer checkout
wizard and staff subscription assignment, and (b) a governed daily discount allowance for sales reps that
caps how much they can knock off any single subscription. Payments remain record-only (no gateway), and we
need a money ledger so a customer's "total spent" is a first-class, queryable number.

### Goals
- A unified, typed coupon model covering percentage / fixed / free-delivery / first-order / min-spend /
  usage-limited / plan-specific / stackable, plus the sales-rep daily capped coupon.
- DB schema (all additive, nullable where needed, generated with `db:generate`): `coupons`,
  `coupon_redemptions`, `ledger_entries`; extend `payments`; add a `discountPolicy` blob to `app_settings`.
- Services that extend the commons abstract service layer (per `services-extend-commons-convention`):
  `couponsService`, `ledgerService`, plus a tx-aware payment-recording + rep-coupon mint/redeem path.
- An admin-only **"Discounts & Coupons"** settings sub-page following the existing settings sub-page
  pattern with typed controls (per `admin-typed-controls`).
- A scheduled job that mints exactly one capped coupon per active sales rep at IST midnight, and a
  server-enforced rule that a rep can grant a discount **only** by applying their valid, unused daily
  coupon, clamped to the admin-set ceilings — no free-typed amounts.
- Both application points (customer wizard, staff assignment) flow through the existing pricing
  `adjustments[]` → `total`.

### Non-Goals
- No real payment gateway. Capture stays manual/simulated; we extend the existing
  `paymentStatus = 'simulated_paid'` rather than integrate Stripe (a later slice).
- No customer self-service coupon dashboard / wallet UI. This slice ships the **settings**, the
  **governance**, and the **application plumbing** only.
- No automatic promo engine (auto-applied campaigns, referral graphs). Coupons are explicitly entered
  (customer types a code) or applied (rep applies their daily coupon).
- No multi-currency. Single currency (CAD), consistent with existing money columns.

---

## 2. Grounding in the Existing Codebase

Decisions below are constrained by these established conventions (verified in-repo):

- **IDs**: every table uses `baseColumns(prefix)` / `updatableColumns(prefix)` from
  `@tiffin/commons-drizzle` — internal `bigint id` defaulted by `next_id()`, public `text public_id`
  (`prefix_<nanoid12>`), epoch-ms `created_at` / `updated_at` (bigint), and `created_by` / `updated_by`
  bigint FKs. **bigint ids never cross the client boundary**; server components/actions project to
  `public_id` and resolve back (see `lead-sources/page.tsx`, `orders.service.ts`).
- **Money**: stored as `numeric(10,2)` dollar strings (`orders.total`, `payments.amount`,
  `mealSizes.basePrice`). The pricing engine works in JS `number` dollars with a `round2` helper. There is
  **no cents convention** in this codebase. This spec stays in `numeric(10,2)` dollars for all new money
  columns and keeps the engine in dollars. (See Open Question Q2.)
- **Services**: `BaseService` / `UpdatableService` (commons) → `SessionBaseService` /
  `SessionUpdatableService` (`apps/web/lib/services/session-service.ts`, adds actor stamping + audit) →
  feature subclasses (e.g. `SoftDeleteService` overriding `delete` → `update({active:false})`). Construct
  with `new UpdatableRepository(db, table, table.publicId, table.id)`.
- **Pricing hook**: `priceSubscription(selections, catalog)` computes `subtotal`, then
  `total = round2(subtotal - sum(adjustments.amount))`. `adjustments: PricingLine[]` is the documented
  coupon hook. Discount lines are **positive magnitudes** that get subtracted.
- **Order/payment write path**: `createOrder` (`orders.service.ts`) is the single authoritative path. In
  one `db.transaction` it inserts `orders`, a `payments` row (`status:'simulated_paid'`, `amount=total`),
  and a `created` `order_activities` row. Both public checkout (`/subscribe/actions.ts → reprice` +
  `createOrder`) and the staff convert flow (`inquiries/[id]/order/actions.ts → previewPrice` +
  `inquiriesService.convert → createOrder`) funnel through it.
- **Roles**: `userRole = ['admin','member','user']`. Staff = `admin|member` (`requireStaff`), customers =
  `user`. There is no dedicated "sales rep" role; **"sales rep" maps to `role='member'`** today (see
  Open Question Q1).
- **Settings sub-page pattern**: `app/(dashboard)/dashboard/settings/<name>/page.tsx` is an async server
  component gated by `requireAdmin()`, fetches + projects data, renders `<PageShell><PageHeader/>…`; a
  sibling `actions.ts` (`"use server"`, each action calls `requireAdmin()` then a service then
  `revalidatePath`); a client `manager.tsx`/`form.tsx` (`"use client"`) holds the form. The settings index
  `page.tsx` has a `SETTINGS` array of cards — add one entry.
- **Config blobs**: `app_settings` already carries typed `jsonb` config (`leadAssignment`, `mealTypes`).
  The lead-assignment config is a TS-interfaced jsonb (`assignment.ts: LeadAssignmentConfig`). We follow
  that pattern for `discountPolicy`.
- **Timezone**: staff IST, customers Canada (`staff-ist-customers-canada`); epoch-ms storage; cutoffs
  anchored to the relevant TZ, DST-aware. Use `@tiffin/commons` `util/zoned-time`. IST is UTC+5:30
  year-round (no DST), so IST-midnight is a fixed UTC instant.
- **Migrations**: `pnpm --filter web db:generate` (drizzle-kit). Additive only; nullable new columns; the
  `next_id()` preamble is hand-maintained in the baseline (`drizzle-migrations-handwritten`).

---

## 3. Coupon Taxonomy

### 3.1 The `coupon_kind` enum (the discriminant)

```
couponKind = pgEnum("coupon_kind", [
  "percentage",     // % off subtotal
  "fixed",          // flat $ off
  "free_delivery",  // zero the delivery portion (forward-looking — see note)
  "first_order",    // % or $ off, redeemable only if the user has no prior order
  "rep_daily",      // sales-rep daily capped coupon (owner-scoped, expiring)
])
```

`min-spend`, `usage-limited`, `plan-specific`, and `stackable` are **not** separate kinds — they are
orthogonal constraints expressed as first-class columns (`minSubtotal`, `maxRedemptions`/`maxPerUser`,
`planTypes`, `stackable`). Any kind may carry any subset of them. This keeps the discount math a function
of `(kind, valuePct, valueAmount)` while the constraints gate eligibility uniformly.

`first_order` is modeled as a kind (not a flag) because it changes eligibility logic, not the math: it
applies a percentage or fixed value but only when `count(orders where user = X) = 0`.

`free_delivery` note: the current pricing engine has **no discrete delivery line** (courier discounts are
folded into `perTiffinPrice` via frequency/tier uplift). `free_delivery` is therefore modeled but resolves
to a `$0.00` adjustment until a delivery line item exists. It is included for schema completeness; see
Open Question Q3.

### 3.2 Discriminated config

The row is discriminated by `kind`. Common, **queryable** constraints are first-class columns. Anything
kind-specific and non-queryable lives in a typed `config jsonb`. The validated TS shape:

```ts
type CouponConfig =
  | { kind: "percentage";    /* uses valuePct */ }
  | { kind: "fixed";         /* uses valueAmount */ }
  | { kind: "free_delivery"; /* no value fields */ }
  | { kind: "first_order";   mode: "percentage" | "fixed" /* uses valuePct|valueAmount */ }
  | { kind: "rep_daily";     /* uses capPct + capAmount; lower-of-two clamps the rep's discount */ };
```

Resolution rule (`couponsService.resolveDiscount`), all in `numeric(10,2)` dollars:

| kind          | discount magnitude                                                        |
|---------------|---------------------------------------------------------------------------|
| percentage    | `round2(subtotal * valuePct/100)`                                         |
| fixed         | `min(valueAmount, subtotal)`                                             |
| first_order   | as percentage or fixed per `config.mode`                                  |
| free_delivery | `min(valueAmount ?? 0, deliveryPortion)` → `0.00` until a delivery line   |
| rep_daily     | `min(requestedAmount, subtotal*capPct/100, capAmount)` — **lower-of-two ceiling** |

The discount is always clamped so it never exceeds `subtotal`, and `total` never goes below `0`.

---

## 4. Database Schema (additive)

New file `apps/web/db/schema/coupons.ts`; export from `db/schema/index.ts`. Extend
`apps/web/db/schema/orders.ts` (payments) and `db/schema/app-settings.ts`. Generate with `db:generate`.

### 4.1 `coupons`

```ts
export const couponKind = pgEnum("coupon_kind",
  ["percentage", "fixed", "free_delivery", "first_order", "rep_daily"]);

export const coupons = pgTable("coupons", {
  ...updatableColumns("cpn"),
  code: text("code").notNull().unique(),            // human/scanned code; rep_daily auto-generated
  kind: couponKind("kind").notNull(),
  name: text("name").notNull(),
  description: text("description"),

  // value (kind-dependent; nullable)
  valuePct: numeric("value_pct", { precision: 5, scale: 2 }),
  valueAmount: numeric("value_amount", { precision: 10, scale: 2 }),

  // rep_daily ceilings (snapshotted at mint so later policy edits don't retro-change today's coupon)
  capPct: numeric("cap_pct", { precision: 5, scale: 2 }),
  capAmount: numeric("cap_amount", { precision: 10, scale: 2 }),

  // orthogonal constraints
  minSubtotal: numeric("min_subtotal", { precision: 10, scale: 2 }),
  maxRedemptions: integer("max_redemptions"),       // global cap; null = unlimited
  maxPerUser: integer("max_per_user"),              // per-user cap; null = unlimited
  redemptionCount: integer("redemption_count").notNull().default(0), // denormalized, bumped in-tx
  stackable: boolean("stackable").notNull().default(false),
  planTypes: text("plan_types").array().notNull().default([]), // plan_type values; [] = all plans

  // validity window (epoch-ms, per project TZ convention)
  startsAt: bigint("starts_at", { mode: "number" }),
  expiresAt: bigint("expires_at", { mode: "number" }),

  // rep_daily ownership + idempotency
  ownerUserId: bigint("owner_user_id", { mode: "bigint" }).references(() => users.id),
  istDate: text("ist_date"),                        // YYYY-MM-DD in IST, for one-per-rep-per-day

  active: boolean("active").notNull().default(true),
  config: jsonb("config").$type<CouponConfig>(),
}, (t) => [
  index("coupons_kind_active_idx").on(t.kind, t.active),
  // one rep_daily coupon per rep per IST day:
  uniqueIndex("coupons_rep_daily_unq").on(t.ownerUserId, t.istDate)
    .where(sql`${t.kind} = 'rep_daily'`),
]);
```

**Why the rep daily coupon is a row in `coupons` (kind `rep_daily`) and not a dedicated table:** the
redemption pipeline, the `adjustments[]` mapping, the validity-window logic, the `coupon_redemptions`
usage tracking, and the validation path are identical to ordinary coupons. A dedicated table would fork
all of that. The only rep-specific facts — owner, daily idempotency, dual ceiling — are expressible as
columns (`ownerUserId`, `istDate`, `capPct`, `capAmount`) gated by a partial unique index. The one cost is
row accumulation (one row per rep per day); mitigated by the `(kind, active)` index and a periodic
archival/cleanup of expired rep_daily rows (see Risks).

### 4.2 `coupon_redemptions` (usage tracking)

```ts
export const couponRedemptions = pgTable("coupon_redemptions", {
  ...baseColumns("cpr"),
  couponId: bigint("coupon_id", { mode: "bigint" }).notNull().references(() => coupons.id),
  userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id), // the customer
  orderId: bigint("order_id", { mode: "bigint" }).notNull().references(() => orders.id),
  redeemedBy: bigint("redeemed_by", { mode: "bigint" }).references(() => users.id),    // staff actor; null = self-serve
  amountApplied: numeric("amount_applied", { precision: 10, scale: 2 }).notNull(),
  context: jsonb("context"),  // snapshot: subtotal, planType, ceilings used, kind
}, (t) => [
  index("coupon_redemptions_coupon_idx").on(t.couponId),
  index("coupon_redemptions_user_idx").on(t.userId),
  index("coupon_redemptions_order_idx").on(t.orderId),
]);
```

By the time `createOrder` writes, `userId` always exists (anonymous checkout provisions a customer by
phone first), so `userId` is `notNull`. Per-user / global caps are enforced from `redemptionCount` and
`count(redemptions where coupon, user)` inside the redeem tx. A `rep_daily` coupon carries
`maxRedemptions = 1`, so the count check + the partial unique mint index together make it single-use.

### 4.3 `ledger_entries` (new — "total spent")

```ts
export const ledgerDirection = pgEnum("ledger_direction", ["debit", "credit"]);
export const ledgerEntryType = pgEnum("ledger_entry_type",
  ["payment", "refund", "discount", "adjustment"]);

export const ledgerEntries = pgTable("ledger_entries", {
  ...baseColumns("led"),
  userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id),
  orderId: bigint("order_id", { mode: "bigint" }).references(() => orders.id),     // nullable
  paymentId: bigint("payment_id", { mode: "bigint" }).references(() => payments.id), // nullable
  direction: ledgerDirection("direction").notNull(),
  type: ledgerEntryType("type").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(), // always positive
  memo: text("memo"),
}, (t) => [
  index("ledger_user_created_idx").on(t.userId, t.createdAt),
  index("ledger_order_idx").on(t.orderId),
]);
```

Semantics (business AR perspective): `payment` = `credit` (customer paid us); `refund` = `debit`;
`discount` = `debit` typed `discount` (records the give-up, not spend); `adjustment` = manual correction.

**Total spent** for a user:
```
SUM(amount) WHERE type='payment'  −  SUM(amount) WHERE type='refund'
```
`discount` rows are excluded from "spent" but available for "total discounts received" reporting.

### 4.4 `payments` extension (additive)

Extend the existing enum and table — keep `'simulated_paid'`, add additive values + columns:

```ts
export const paymentStatus = pgEnum("payment_status",
  ["simulated_paid", "pending", "refunded"]);   // additive; 'simulated_paid' stays the default

// added columns on payments (all nullable / defaulted):
paymentMethod: pgEnum("payment_method", ["simulated", "cash", "etransfer", "manual"]) // default 'simulated'
capturedAt:   bigint("captured_at", { mode: "number" }),  // epoch-ms; set when manually captured
note:         text("note"),
```

Capture stays manual/simulated. `recordPayment` writes the `payments` row **and** a matching
`ledger_entries` credit in the same tx.

### 4.5 `app_settings.discountPolicy` (additive jsonb)

```ts
// add to appSettings:
discountPolicy: jsonb("discount_policy").$type<DiscountPolicy>(),
```

```ts
interface DiscountPolicy {
  enabledKinds: CouponKind[];        // which coupon kinds admins may create / are honored
  repDaily: {
    enabled: boolean;
    defaultCapPct: number;           // global rep ceiling, %
    defaultCapAmount: number;        // global rep ceiling, $
    perRep: Record<string /* usr_ publicId */, {
      capPct?: number; capAmount?: number; active: boolean;
    }>;                              // overrides the default; absent = use default
  };
}
```

Mirrors the `leadAssignment` jsonb pattern (default + `perSource` overrides). Per-rep entry overrides the
default ceilings; the **lower of (pct ceiling applied to subtotal, $ ceiling)** is enforced at redemption.

---

## 5. Services (extend commons)

All under `apps/web/lib/services/`, subclassing the session services so writes are actor-stamped + audited.

### 5.1 `couponsService` (`coupons.service.ts`)
```ts
class CouponsService extends SessionUpdatableService<typeof coupons> {
  // CRUD inherited (create/read/update/list). delete → soft via update({active:false}).

  // Pure-ish resolution: given a coupon row + pricing context, returns the discount PricingLine
  // (positive magnitude) or throws ValidationError. Does NOT touch the DB beyond the eligibility reads.
  resolveDiscount(coupon, ctx: { subtotal; planType; userId; requestedAmount?; actorId? }): PricingLine

  // Customer self-serve: look up an active public coupon by code, validate window/min-spend/plan/usage,
  // first_order eligibility, then resolveDiscount. Rejects rep_daily codes here.
  validatePublicCode(code, ctx): Promise<PricingLine>

  // Staff: validate the actor's OWN rep_daily coupon (owner == actor, kind rep_daily, IST-day valid,
  // unused), clamp requestedAmount to the dual ceiling. Rejects any code not owned by the actor.
  validateRepCoupon(code, ctx): Promise<PricingLine>

  // tx-aware: insert coupon_redemptions, bump redemptionCount, enforce maxRedemptions/maxPerUser
  // under the row, write the ledger 'discount' debit. Called INSIDE createOrder's transaction.
  redeem(tx, { coupon, userId, orderId, redeemedBy, amountApplied, context }): Promise<void>

  // Cron: mint one rep_daily coupon for a rep+IST-day with snapshotted ceilings. Idempotent via the
  // partial unique index (ON CONFLICT DO NOTHING).
  mintRepDaily(tx, { ownerUserId, istDate, capPct, capAmount, expiresAt }): Promise<void>
}
export const couponsService = new CouponsService(new UpdatableRepository(db, coupons, coupons.publicId, coupons.id));
```

### 5.2 `ledgerService` (`ledger.service.ts`)
```ts
class LedgerService extends SessionBaseService<typeof ledgerEntries> {
  record(tx, { userId, orderId?, paymentId?, direction, type, amount, memo? }): Promise<void>
  totalSpent(userId): Promise<string>     // SUM(payment) − SUM(refund)
}
```
Ledger entries are append-only — no update/delete exposed (corrections are new `adjustment` rows).

### 5.3 Payment recording (extend `orders.service.ts`)
A `recordPayment(tx, { orderId, userId, amount, method, status })` helper writes the `payments` row and a
`ledger_entries` credit (`type:'payment'`) in the same tx. `createOrder` calls it where it currently
inserts `payments` directly, so every recorded payment produces a ledger credit.

---

## 6. Application Points (both via `adjustments[]`)

### 6.1 Pricing engine signature change
Keep the engine pure; coupon resolution (DB-backed) stays in the service layer. Extend:

```ts
export function priceSubscription(
  selections: PricingSelections,
  catalog: PricingCatalog,
  adjustments: PricingLine[] = [],   // NEW: resolved discount lines, positive magnitudes
): PricingResult
```
`total = round2(subtotal − sum(adjustments.amount))`, floored at 0. Existing callers pass nothing and are
unaffected. Engine stays unit-testable with no DB.

### 6.2 Customer wizard / checkout (public coupons)
- `subscribe/actions.ts → reprice(selections, couponCode?)`: if a code is present, call
  `couponsService.validatePublicCode` → push the returned `PricingLine` into `adjustments` →
  `priceSubscription(...)`. Errors return a typed `{ error }` the wizard surfaces inline (invalid / expired
  / min-spend not met / not first order).
- `createOrder` re-resolves the code **server-side** (never trusts a client-sent amount), re-prices, and
  calls `couponsService.redeem(tx, …)` inside the order tx.

### 6.3 Staff assignment (rep coupons)
- `inquiries/[id]/order/actions.ts → previewPrice(input, couponCode?, requestedAmount?)`: calls
  `couponsService.validateRepCoupon` (owner == acting staff, IST-day-valid, unused), clamps to the dual
  ceiling, returns the adjustment line for the preview.
- A **discount panel** in the staff order form lets the rep pick their daily coupon (it is the only one
  they own that is valid today) and enter a discount **≤ the ceiling**. The control is a clamped number
  input bounded by the server-returned ceiling — it is never a free-text amount.
- `createOrder` (via the convert path) re-validates the rep coupon server-side and redeems in-tx. **If a
  discount amount arrives without a backing valid rep coupon owned by the actor, `createOrder` throws
  `ValidationError`.** This is the hard gate: reps cannot free-type discounts.

### 6.4 Stacking
Default `stackable=false`. At most **one rep_daily coupon** plus optionally **one stackable public
coupon** per order (see Open Question Q4). Coupon discounts stack on top of the already-computed
`subtotal` (which itself already reflects tier/frequency/duration uplifts baked into `perTiffinPrice`) —
coupons are a separate, additive `adjustments[]` layer, never compounded into `perTiffinPrice`.

---

## 7. Admin "Discounts & Coupons" Settings Sub-page

Route `app/(dashboard)/dashboard/settings/discounts/`. Admin-only. Add a card to the settings index
`SETTINGS` array (icon e.g. `TicketPercent` / `BadgePercent` from lucide).

- **`page.tsx`** — async server component, `await requireAdmin()`. Fetches coupons (projected to
  `public_id` + display fields; **no bigints to the client**), the active rep roster
  (`role='member'`, `active`), and `app_settings.discountPolicy`. Renders `<PageShell><PageHeader/>` then a
  `<DiscountsManager/>` client component.
- **`actions.ts`** — `"use server"`; each action `await requireAdmin()` → service call → `revalidatePath`.
  Actions: `saveCoupon(publicId|null, patch)`, `setCouponActive(publicId, active)`,
  `saveDiscountPolicy(policy)` (ceilings + enabled kinds + per-rep overrides),
  `setRepCeiling(repPublicId, {capPct, capAmount, active})`. Parent FK/owner resolution (rep public_id →
  bigint) happens in the action, never on the client (mirrors `lead-sources/actions.ts`).
- **`manager.tsx`** (`"use client"`) — three sections:
  1. **Coupon CRUD** table + dialog form. Typed controls only (per `admin-typed-controls`): `kind` is a
     `select`; `planTypes` a multiselect of the `plan_type` enum; value/cap/min are number inputs with
     unit affordances; `startsAt`/`expiresAt` are date(-time) pickers; `stackable`/`active` are switches.
     The value fields shown switch on the selected `kind` (percentage shows `valuePct`, fixed shows
     `valueAmount`, etc.) — no free-text for enums/dates/refs.
  2. **Global rep ceilings** — `defaultCapPct` + `defaultCapAmount` number inputs, with copy stating the
     **lower of the two applies** to any single rep discount.
  3. **Per-rep overrides** — one row per active rep (name + role badge) with optional `capPct`/`capAmount`
     overrides and an active toggle.
  4. **Enabled kinds** — multiselect of `coupon_kind` controlling which kinds may be created/honored.

`rep_daily` coupons are **not** hand-created here; they are minted by cron. The page may show a read-only
"today's rep coupons" list for visibility.

---

## 8. Sales-Rep Daily-Coupon Governance

### 8.1 Minting (cron)
- **Mechanism: Vercel Cron** (the deploy target; see Open Question Q6) → a protected Next.js route handler.
  `vercel.json` at repo/app root:
  ```json
  { "crons": [ { "path": "/api/cron/mint-rep-coupons", "schedule": "30 18 * * *" } ] }
  ```
  `30 18 * * *` UTC = **00:00 IST** (IST = UTC+5:30, no DST → fixed instant year-round).
- **Route** `app/api/cron/mint-rep-coupons/route.ts`: verify `Authorization: Bearer ${CRON_SECRET}`
  (reject otherwise). Compute the IST date string via `util/zoned-time`. Read
  `app_settings.discountPolicy.repDaily`. If disabled, no-op. List active reps (`role='member'`, `active`,
  honoring `perRep[...].active`). For each, in one tx, `couponsService.mintRepDaily` an idempotent
  `rep_daily` coupon:
  - `code` = `REP-<istDate>-<repPublicSuffix>`, `ownerUserId`, `istDate`,
  - `capPct`/`capAmount` = effective ceilings (per-rep override ?? default) **snapshotted**,
  - `maxRedemptions = 1`, `maxPerUser = 1`,
  - `expiresAt` = next 18:30 UTC (end of the IST day).
  Idempotent via the partial unique index (`ON CONFLICT DO NOTHING`), so re-runs/redeploys are safe.
- AGENTS.md flags that this Next.js may differ from training data — **read
  `node_modules/next/dist/docs/` for the current route-handler / cron contract before implementing.**

### 8.2 Applying & enforcement (recap of §6.3)
- A rep's only valid coupon on a given day is their own `rep_daily` coupon; the discount panel offers it
  and bounds the amount to the server-computed ceiling.
- Server enforcement is authoritative: `validateRepCoupon` checks owner == actor, kind == `rep_daily`,
  within `[startsAt, expiresAt]` for the IST day, unused (`redemptionCount = 0`), and clamps to
  `min(requested, subtotal*capPct/100, capAmount)`. `createOrder` re-validates and redeems in-tx; a
  discount with no valid backing rep coupon is rejected.
- The discount lands as a single `adjustments[]` line labeled with the coupon name/code; `redeem` writes
  the `coupon_redemptions` row + the `discount` ledger debit in the same order tx.

---

## 9. UI/UX Direction

Apply `make-interfaces-feel-better`, `impeccable`, and `vercel-react-best-practices`:
- **Server components fetch + project data; client components own forms** (`"use client"` only where state
  lives). No bigint ids in client props.
- **Typed controls everywhere** (selects, multiselects, switches, date pickers, bounded number inputs) —
  never free-text for enums/dates/refs/amounts (`admin-typed-controls`).
- Money rendered with `tabular-nums`; ceilings shown as "X% or $Y, whichever is lower". Inline validation
  on coupon-code entry (debounced server check) with clear success/expired/ineligible states.
- **No text effects** anywhere (no gradient/clip/animation on text) — plain solid color (per memory).
- Reuse the existing `@/components/ds` primitives (`PageShell`, `PageHeader`, `SectionCard`, `Card`) so
  the sub-page matches the other settings pages exactly.
- Empty/disabled states: when `repDaily.enabled=false`, the rep discount panel is hidden with a one-line
  explanation; reps with no minted coupon today see a clear "no discount available today" state.

---

## 10. Risks & Mitigations

- **Client-trusted discount amount** → never trust it; the amount is recomputed server-side from the
  coupon + ceilings inside `createOrder`. (Primary security property.)
- **Double redemption / race** → partial unique mint index + `maxRedemptions` count check **inside** the
  order tx; rep_daily is single-use.
- **`rep_daily` row growth** (reps × days) → indexed by `(kind, active)`; periodic archival/cleanup of
  expired rep_daily rows (a follow-up housekeeping cron). Not a correctness risk.
- **IST day boundary correctness** → IST has no DST, so the fixed `30 18 * * *` UTC trigger is exact;
  `istDate` + `expiresAt` derived via `util/zoned-time`. Customer (Canada) DST is irrelevant to minting.
- **Rounding** → engine works in `round2` dollars; discount magnitudes are `round2`'d and clamped to
  `subtotal`; `total` floored at 0. Stored as `numeric(10,2)`.
- **Stacking ambiguity** → default non-stackable; explicit one-rep + one-stackable-public rule pending
  Q4.
- **first_order eligibility** needs a prior-order count query — cheap (indexed `orders_user_created_idx`).
- **CRON_SECRET / deploy target** → if not Vercel, the cron mechanism changes (Q6).

---

## 11. Execution Plan (sequence of ultracode workflows)

1. **Schema + services** — add `db/schema/coupons.ts` (`coupons`, `coupon_redemptions`,
   `ledger_entries`), extend `payments` (enum values + columns) and `app_settings.discountPolicy`; export
   from `schema/index.ts`; `db:generate`. Implement `couponsService`, `ledgerService`,
   `recordPayment`; extend `priceSubscription` to accept `adjustments`. Live-DB service tests per
   `live-db-test-harness` (resolution math, lower-of-two ceiling, usage caps, total-spent).
2. **Admin settings sub-page** — `settings/discounts/{page,actions,manager}.tsx`; add the index card;
   coupon CRUD + global/per-rep ceilings + enabled-kinds, all typed controls; admin-gated.
3. **Governance + cron** — `vercel.json` cron, `app/api/cron/mint-rep-coupons/route.ts` (CRON_SECRET
   guard, idempotent mint), `validateRepCoupon`/`mintRepDaily`, and the staff discount panel in the order
   form. (Read the bundled Next docs first per AGENTS.md.)
4. **Application points** — wire `reprice` + `createOrder` (customer public coupon) and
   `previewPrice` + the convert path (rep coupon) through `adjustments[]`; redeem + ledger writes in the
   order tx; the hard server-side rejection of unbacked discounts.

Each step is independently shippable: after (1) the hook exists but is dormant; (2) admins can configure;
(3) coupons get minted/validated; (4) discounts actually reach `total`.

---

## 12. Open Questions (need the user)

1. **Sales-rep identity** — there is no `sales_rep` role; `role='member'` = all staff. Mint daily coupons
   for *every* active member, or gate on a new `users.isSalesRep` flag / a roster in `discountPolicy`?
   (Recommend a per-rep roster in `discountPolicy.repDaily.perRep`, defaulting to all active members.)
2. **Money unit** — confirm staying in `numeric(10,2)` dollars (consistent with the engine + existing
   columns) rather than introducing integer cents.
3. **`free_delivery`** — there is no discrete delivery line in pricing today. Ship `free_delivery` as a
   `$0` placeholder now, or add a delivery line item to the engine first (larger change)?
4. **Stacking** — confirm "≤ one rep_daily + ≤ one stackable public coupon per order," or a different
   policy.
5. **Customer coupon field timing** — the customer *dashboard* is a later slice, but does the **checkout
   wizard** get its coupon-code input now (the application point is in this slice)? Recommend yes.
6. **Deploy target / cron** — confirm Vercel Cron (drives `vercel.json` + `CRON_SECRET`). If self-hosted,
   we need an alternative scheduler (system cron hitting the protected route, or a worker).
