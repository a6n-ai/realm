# Tiffin Grab — Subsystem D Design Spec

**Date:** 2026-06-19
**Scope:** Subsystem D — Inquiries CRM + agent order creation + admin catalog editor,
plus two slice-1 amendments it requires: the `subscriptions`→`orders` rename and a
dual-identity user model (staff email-based, customers phone-based; either logs in).
**Builds on:** Slice 1 (A Foundation + B Auth/RBAC/Flags + C Wizard/Checkout) —
see `docs/superpowers/specs/2026-06-18-tiffin-grab-mvp-design.md`.
**Deferred:** E (Weekly-menu engine), F (Marketing website) — see `PROJECT.md`.

---

## 1. Goals & non-goals

**Goals**
- A sales-agent (`member`) **inquiry pipeline**: capture partial leads (incl. Facebook/Google
  ads), move them `new → contacted → follow_up → converted → lost`, with a full activity timeline.
- **Agent order creation**: a `member` completes an order on a customer's behalf via a dedicated
  dashboard form, reusing the server-side pricing engine and a shared order-creation service.
- **Admin catalog editor**: CRUD over the six catalog tables (replacing the seed as source of
  truth), with soft-delete so existing orders stay valid.
- **Dual identity, role convention**: both phone and email are unique-when-present; an account needs
  at least one. **Staff** (`admin`/`member`) are email-based; **customers** (`user`) are phone-based.
  Login accepts either. Customers can self-edit phone and/or email with validation.

**Non-goals (this slice)**
- Weekly menu release & per-day meal selection (E).
- Marketing/public-site design (F).
- Real payment processing — order payment remains **simulated** (inherited from slice 1).
- Recurring billing cycles — an order is a one-time priced commitment, not a recurring schedule.

---

## 2. Terminology & domain model

- **Inquiry** — a partial/half-filled lead. May arrive from an ad (Facebook/Google) with only a
  name + phone. Convertible later. Lives only in the CRM until converted.
- **Order** — a fully-filled form **plus** a completed checkout. This is what slice 1 called a
  `subscription`. Renamed to `orders` in this slice (see §3.1).
- **Conversion** — an inquiry becomes an order: the agent fills the remaining selections, completes
  checkout (`createOrder`), and the inquiry is stamped `converted` + linked to the new order.

---

## 3. Data model

### 3.1 Rename: `subscriptions` → `orders`
A mechanical but cross-cutting rename touching shipped slice-1 code.

- Table `subscriptions` → `orders`.
- Enum `subscription_status` → `order_status` (values unchanged: `pending`,`active`,`waitlisted`,`cancelled`).
- `payments.subscriptionId` → `payments.orderId` (FK retargeted to `orders.id`).
- All code refs: `db/schema/orders.ts`, `lib/catalog`, `lib/pricing`, `checkout/actions.ts`,
  activation screen, dashboard. Drizzle column name `deployment_id` unchanged.
- Migration renames table/columns/enum in place (no data loss).

### 3.2 `users` amendment (dual identity)
Both identifiers are optional at the DB level and unique-when-present; the app enforces "at least
one", and a role convention decides which is expected.

- `phone` → **nullable**, with a **partial unique index** (`WHERE phone IS NOT NULL`).
- `email` → **nullable**, with a **partial unique index** (`WHERE email IS NOT NULL`).
- `passwordHash` stays nullable (auto-provisioned accounts use the temp password).
- **App-level invariant** (service layer, not a DB constraint): every user has at least one of
  phone/email. Role convention:
  - `admin` / `member` (staff) → **email required**, phone optional.
  - `user` (customer) → **phone required**, email optional.
  Enforced in the users service on create/update and in provisioning.
- **Migration / backfill:** no `NOT NULL` is added, so existing slice-1 rows (email-based staff/
  seed users) need no phone backfill. Only the two partial unique indexes are added. The seed
  assigns staff emails and customer phones per the convention.

### 3.3 `inquiries` *(updatable)*
| Column | Type | Notes |
|---|---|---|
| `...updatableColumns` | | id, created/updated audit |
| `fullName` | text | **required** |
| `phone` | text | **required** |
| `email` | text | optional |
| `source` | enum `inquiry_source` | `website`,`facebook`,`google`,`manual`,`referral` |
| `stage` | enum `inquiry_stage` | `new`,`contacted`,`follow_up`,`converted`,`lost`; default `new` |
| `assignedTo` | uuid → users | nullable (the member) |
| `convertedOrderId` | uuid → orders | nullable; set on convert |
| `prefs` | jsonb | partial selections captured to seed the order form |
| `notes` | text | initial freeform note |

### 3.4 `inquiry_activities` *(immutable, baseColumns)*
Append-only timeline; covers manual notes **and** auto-logged stage transitions.

| Column | Type | Notes |
|---|---|---|
| `...baseColumns` | | id, createdAt, createdBy (= the actor) |
| `inquiryId` | uuid → inquiries | required |
| `type` | enum `inquiry_activity_type` | `created`,`note`,`stage_change`,`converted` |
| `note` | text | manual note text or transition summary |
| `fromStage` | enum `inquiry_stage` | nullable; set on `stage_change` |
| `toStage` | enum `inquiry_stage` | nullable; set on `stage_change`/`converted` |

Rules: creating an inquiry writes a `created` activity. `changeStage` writes a `stage_change` (with
from/to). A manual note writes `note`. Convert writes a `converted` activity.

### 3.5 Catalog soft-delete
Add `active` boolean (`default true, notNull`) to `plans`, `meal_sizes`, `addons`,
`delivery_frequencies`, `duration_packages`. (`delivery_zones` already has `active`.)
- "Delete" in the editor sets `active=false` — the row is retained so historical orders that FK to
  it stay valid.
- The wizard catalog loader (`lib/catalog/load.ts`) filters `active=true`. The admin editor lists
  all rows regardless and shows active state.

---

## 4. Auth amendment (slice-1 B)

- **`authorize()`** (Auth.js v5 Credentials): one identifier input. Resolve the user by `phone`
  OR `email` (single query with an `OR`), then bcrypt-verify `passwordHash`. Null/!match → reject.
- **Login form** (`/login`): a single "Phone or email" field + password.
- **Provisioning** (checkout + convert, always customers): keyed by **phone** via
  `onConflictDoNothing` on the phone partial-unique index. Email set only when supplied; if it
  already belongs to a different user, throw `ValidationError` (no silent reuse). Staff accounts are
  created email-first (admin user management), not auto-provisioned.
- JWT session strategy (slice-1 deviation) is retained; the token still carries `role`.

---

## 5. Services

### 5.1 Extract `createOrder` (shared)
Move the order-creation logic out of `app/(public)/checkout/actions.ts confirmSubscription` into
`lib/services/orders.service.ts`:

```
createOrder(input, actorId?) -> { deploymentId }
```
- Authoritative reprice via `priceSubscription` (never trust client totals).
- Resolve/provision the customer **by phone** inside the tx (`onConflictDoNothing` on phone),
  set email if provided (collision → `ValidationError`).
- Insert the `orders` row + simulated `payments` row in one tx.
- `createdBy` = `actorId` (the member for agent orders) or null (public anonymous checkout).
- `confirmSubscription` (public) and the agent form both call this — single source of truth,
  removing the current duplication.

### 5.2 `inquiries.service.ts` (UpdatableService)
- CRUD over `inquiries`.
- `addNote(inquiryId, note, actorId)` → writes a `note` activity.
- `changeStage(inquiryId, toStage, actorId)` → updates `stage`, writes a `stage_change` activity
  (from = current stage).
- `convert(inquiryId, orderInput, actorId)` → `createOrder` → set `convertedOrderId`,
  `stage='converted'`, write a `converted` activity. Transactional.
- `listActivities(inquiryId)` → timeline (newest-first).

### 5.3 Catalog services
An `UpdatableService` per catalog table (`plans`, `meal_sizes` [exists], `addons`,
`delivery_frequencies`, `duration_packages`, `delivery_zones`). "Delete" = `update({ active:false })`.

### 5.4 `users` service amendment
- `updateContact(userId, { phone?, email? })` — self-service edit. Validates phone format
  (Canadian) + email format; enforces uniqueness (new phone/email must not belong to another
  user) **and** the role invariant (can't clear the identifier the user's role requires).
  Collision/empty → `ValidationError`.

---

## 6. API + UI

### 6.1 REST (existing `@tiffin/commons-next` factories)
- `/api/inquiries` (+ `[id]`, `query`) — member/admin guarded.
- Catalog resources: `/api/plans`, `/api/meal-sizes` (exists), `/api/addons`,
  `/api/delivery-frequencies`, `/api/duration-packages`, `/api/delivery-zones` — admin guarded.
- Mutations needing pricing/transactions (convert, agent order) use **Server Actions**, not REST.

### 6.2 Dashboard pages
- `/dashboard/inquiries` — pipeline list/board across the five stages; create-inquiry form
  (name + phone required, email/source/notes optional).
- `/dashboard/inquiries/[id]` — detail: contact, stage control, activity timeline, "Create order".
- `/dashboard/inquiries/[id]/order` — **dedicated agent order form**: all selections on one page,
  prefilled from inquiry `prefs`/contact, calls `createOrder` (→ marks inquiry converted).
- `/dashboard/catalog/*` — admin editor per catalog table (edit, soft-delete, reactivate).
- `/dashboard/account` — customer self-edit of phone/email (validated).
- **Sidebar**: un-stub **Inquiries** (member+admin); add **Catalog** (admin-only); add **Account**;
  wire role gating so members never see Catalog/Users.

### 6.3 Access control
- `member`: inquiries pipeline + agent order creation.
- `admin`: everything a member can do **plus** catalog editor + users/flags (superset).
- Enforced in `proxy.ts` route guard + per-route `guard` hooks + server-layout checks.

---

## 7. Testing (Vitest)

- Inquiry stage transitions write correct `stage_change` activities (from/to).
- `convert` flow: creates order, links `convertedOrderId`, sets stage, writes `converted` activity.
- `createOrder` reprice parity: public checkout and agent form produce identical pricing for the
  same selections.
- `authorize()` resolves a user by phone and by email; rejects on wrong password / unknown id.
- `updateContact` uniqueness: rejects a phone/email already owned by another user.
- Wizard catalog loader excludes `active=false` rows; editor includes them.
- Re-verify slice 1 green after the rename + users migration (tests + typecheck + build).

---

## 8. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `subscriptions`→`orders` rename touches shipped slice-1 code | Mechanical rename + full re-verify (tests/typecheck/build) before merge |
| Identifier uniqueness must ignore NULLs | Two Postgres **partial unique indexes** (`WHERE phone IS NOT NULL`, `WHERE email IS NOT NULL`); no NOT NULL added, so no backfill needed |
| "At least one identifier" not expressible as a simple DB constraint | Enforced in the users service (create/update/provision) + role convention; covered by tests |
| Pricing drift between public checkout and agent form | Both call the single extracted `createOrder` (authoritative reprice) |
| Deleting catalog rows referenced by orders | Soft-delete via `active`; no hard deletes from the editor |
| Phone/email collision on self-edit or provisioning | `updateContact`/`createOrder` validate uniqueness, throw `ValidationError` |

---

## 9. Out of scope / follow-up (tracked in PROJECT.md)

- **E** Weekly-menu engine (release + per-day meal selection; mixed-plan per-day scheduling).
- **F** Marketing website revamp.
- Real payment gateway, email/SMS delivery, password reset, production hosting config.
