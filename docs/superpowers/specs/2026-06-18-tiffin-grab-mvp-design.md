# Tiffin Grab — MVP (Slice 1) Design Spec

**Date:** 2026-06-18
**Scope:** Subsystems A (Foundation) + B (Auth/RBAC/Flags) + C (Subscription wizard/checkout/activation)
**Deferred:** D (Inquiries CRM), E (Weekly-menu engine), F (Marketing website) — see `PROJECT.md`.

---

## 1. Goals & non-goals

**Goals**
- A reusable monorepo foundation: DB + Drizzle ORM, base-entity column tiers, two-tier
  repository/service stack in shared packages.
- A single Auth.js v5 login for `admin` / `member` / `user`, with normalized roles and
  per-user feature flags an admin can grant.
- A public, guided subscription wizard (4 steps) → checkout (2 steps) → activation that
  prices entirely server-side and auto-provisions a customer account.

**Non-goals (this slice)**
- Inquiry pipeline & sales-agent order creation (D).
- Weekly menu release & per-day meal selection (E).
- Real payment processing — checkout payment is **simulated**.
- Marketing/public-site design (F).

---

## 2. Architecture

- **Monorepo:** Turborepo + pnpm. `apps/web` (Next.js 16) consumes `@tiffin/commons` and
  `@tiffin/commons-drizzle`.
- **App:** Next.js 16 App Router with route groups, Server Actions for mutations/pricing.
- **Data:** PostgreSQL + Drizzle ORM; `drizzle-kit` for migrations; a seed script for the catalog.
- **Auth:** Auth.js v5 Credentials provider, **database sessions** via the Drizzle adapter
  plus a manual credential→session bridge (see §6).
- **UI:** Tailwind v4 + shadcn (Nova preset). UI polish governed by the `impeccable` skill.

### Repository layout
```
tiffin-grab/
├─ apps/web/                        # Next.js 16 app (existing app relocated here)
│  ├─ app/
│  │  ├─ (auth)/login/
│  │  ├─ (public)/subscribe/        # 4-step wizard
│  │  ├─ (public)/checkout/         # 2-step checkout
│  │  ├─ (public)/activate/[deploymentId]/
│  │  ├─ (dashboard)/dashboard/     # role-gated
│  │  └─ api/auth/[...nextauth]/
│  ├─ proxy.ts                      # route guard (Next 16 renamed middleware)
│  ├─ db/{schema, seed, client}
│  ├─ lib/{auth, pricing, catalog, flags, services}
│  └─ components/{ui, wizard, dashboard}
├─ packages/commons/                # @tiffin/commons
└─ packages/commons-drizzle/        # @tiffin/commons-drizzle
```

---

## 3. Shared packages

### 3.1 `@tiffin/commons` (DB-agnostic)
Port of the reference `commons` module's reusable, persistence-free pieces.

- **`model/dto`** — base entity type shapes:
  - `BaseDTO` → `{ id, createdAt, createdBy }` (immutable)
  - `UpdatableDTO extends BaseDTO` → adds `{ updatedAt, updatedBy }`
- **`model/condition`** — structured query-filter model (port of `AbstractCondition`):
  - `FilterCondition` (field, operator, value), `ComplexCondition` (AND/OR of conditions),
    operators (`EQUALS`, `IN`, `LIKE`, `GREATER_THAN`, `BETWEEN`, …).
  - Lets repositories accept structured filters like jOOQ `readPageFilter`.
- **`errors`** — typed app errors (`NotFoundError`, `ValidationError`, `AuthError`) with HTTP status.
- **`enums`** — shared enums (`Role`, pipeline stages for D, etc.).
- **`util`** — id/code generation (e.g. `SUB-XXXX`), pagination types.

No DB or framework dependencies → reusable anywhere.

### 3.2 `@tiffin/commons-drizzle` (Drizzle persistence)
Port of `commons-jooq`'s DAO/service tiers, plus the column conventions.

- **`columns.ts`** — composable column sets (the abstract-class equivalent):
  ```ts
  export const baseColumns = {
    id: uuid("id").defaultRandom().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by"),
  };
  export const updatableColumns = {
    ...baseColumns,
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow().notNull().$onUpdate(() => new Date()),
    updatedBy: uuid("updated_by"),
  };
  ```
- **`repository.ts`** — DAO tier:
  - `BaseRepository<TTable>` ~ `AbstractDAO`: `create(data, actorId?)` (stamps `createdBy`),
    `findById`, `findMany(condition?, { page, size, orderBy })`, `delete`.
  - `UpdatableRepository<TTable> extends BaseRepository` ~ `AbstractUpdatableDAO`:
    `update(id, patch, actorId?)` (stamps `updatedBy`; `updatedAt` auto via `$onUpdate`).
- **`service.ts`** — service tier:
  - `BaseService` ~ `AbstractJOOQDataService`: wraps a repo, `currentUserId()` hook
    (reads Auth.js session = `getLoggedInUserId`), `create/read/list/delete`.
  - `UpdatableService extends BaseService` ~ `AbstractJOOQUpdatableDataService`: adds `update`.
- **`condition.ts`** — translates a `@tiffin/commons` condition tree into a Drizzle `where`.

TS generics replace the Java reflection/`ObjectMapper` path; Drizzle `update().set(patch)`
is type-checked, so no field-introspection is needed.

---

## 4. Data model

All tables use `baseColumns` (immutable) or `updatableColumns` (updatable). PKs are uuid v4.

### 4.1 Auth & RBAC (updatable unless noted)
- **`users`** — `...updatableColumns`, `email` (unique), `passwordHash`, `name`, `phone`,
  `role` enum(`admin`,`member`,`user`).
- **`accounts`**, **`sessions`** *(immutable)*, **`verification_tokens`** — Auth.js Drizzle adapter tables.
- **`feature_flags`** — `key` (unique), `label`, `description`, `defaultEnabled` bool.
- **`user_feature_flags`** — `userId`, `flagId`, `enabled` bool; unique(`userId`,`flagId`).
  Effective flag = override `enabled` if a row exists, else `feature_flags.defaultEnabled`.

### 4.2 Catalog (seeded; updatable)
- **`plans`** — nutrition baseline: `key`(`veg`,`halal_nonveg`,`mixed`), `name`, `description`.
- **`meal_sizes`** — `key`, `name`, `tier`(`budget`,`medium`,`premium`), `diet`(`veg`,`nonveg`,`both`),
  `components` jsonb, `kcalMin`, `kcalMax`, `proteinG`, `carbsG`, `fatG`, `basePrice`.
  (Seeds: Small Thali, Sabzi Only, 4-Item Regular/Large, 5-Item Regular, New Thali,
  5-Item Large, Maharaja Thali — per the brief.)
- **`addons`** — `key`(`saturday`,`sunday`), `name`, `pricePerWeek` (+$15.00 each).
- **`delivery_frequencies`** — `key`(`5_day`,`mwf`), `daysPerWeek`, `courierDiscountPct`
  (MWF = 10%).
- **`duration_packages`** — `weeks`(1,2,4,8,12), `discountPct`(0,2,5,10,15).
- **`delivery_zones`** — `name`, `postalPrefixes` text[], `slotWindow`, `active` bool
  (GTA: Etobicoke, Mississauga, Brampton, Toronto, Scarborough, Markham, Richmond Hill,
  North York, Vaughan, Oakville, East York).

### 4.3 Orders
- **`subscriptions`** *(updatable)* — `userId`, `planId`, `mealSizeId`, `frequencyId`,
  `dailyQty`(1–5), `includeSaturday`, `includeSunday`, `isStudent`, `durationWeeks`,
  `pricingSnapshot` jsonb (full line-item breakdown), `weeklyFee`, `total`,
  `status`(`pending`,`active`,`waitlisted`,`cancelled`), `deploymentId`(`SUB-XXXX`, unique),
  `zoneId`, address fields (`fullName`, `addressLine`, `city`, `postalCode`).
- **`payments`** *(immutable)* — `subscriptionId`, `status`(`simulated_paid`), `amount`.
  No card data stored.

---

## 5. Pricing engine (`apps/web/lib/pricing`)

Pure, server-side function — the single source of truth for money.

```
priceSubscription(selections, catalog) -> {
  lineItems: [...],            // base meal × dailyQty × billable days, add-ons
  discounts: [...],            // courier (MWF 10%), student (10%), duration (0–15%)
  weeklyFee, durationWeeks, total
}
```

- Inputs are **ids/flags** referencing the catalog; prices are looked up server-side.
- Discount order is explicit and documented (courier → student → duration applied to subtotal).
- Used by the wizard for live preview (Server Action) **and** at checkout as the authoritative
  recomputation. Client-submitted totals are ignored.
- **Unit-tested with Vitest** — highest-risk logic in the slice.

---

## 6. Auth + RBAC + feature flags

- **`/login`** — single shadcn form (email + password). Auth.js v5 Credentials provider
  validates against `users.passwordHash` (bcrypt).
- **Database sessions:** Credentials + DB sessions is a known Auth.js v5 rough edge (null
  sessions). Mitigation: a **credential→session bridge** — on successful authorize, create a
  `sessions` row and set the session cookie explicitly, so DB sessions work with credentials.
  *Fallback:* if the bridge fights Next 16 during implementation, drop to JWT sessions
  carrying `role` + a flags snapshot (documented deviation).
- **Route protection:** `proxy.ts` (Next 16's renamed middleware) guards `/dashboard/*`;
  admin-only subtrees are additionally checked in the server layout. A `proxy` named export
  is required (Next 16 contract).
- **Flags API:** `lib/flags.ts` → `getEffectiveFlags(userId)` and `hasFlag(user, key)`;
  a `<FeatureGate flag="...">` server component.
- **Admin UI** (`/dashboard/users`): list users → change `role`, toggle each catalog flag
  per user (writes `user_feature_flags`).

---

## 7. Subscription wizard → checkout → activation (subsystem C)

> The brief's intro said "3 steps" but its detailed breakdown lists **4 wizard steps + 2
> checkout steps + activation**. This spec implements the detailed version.

Public flow at `/subscribe` (no login required to start). Wizard state held client-side;
each step calls a Server Action to validate + reprice.

**Step 1 — Nutrition baseline.** Choose `Pure Vegetarian`, `Halal Non-Veg`, or
`Veg & Non-Veg Mixed`. Selection filters available meal sizes by diet. (Mixed enables
alternating veg/non-veg day scheduling — captured as config; day-level dish picking is
subsystem E.)

**Step 2 — Build bundle.** Diet tabs (All / Veg / Non-Veg). Meal sizes grouped by tier
(Budget / Medium / Premium). Selecting a size activates a macro panel (kcal range,
protein, carbs, fat) from `meal_sizes`.

**Step 3 — Schedule, timing & quantity.** Delivery frequency (`5_day` Mon–Fri, or `mwf`
3-day with auto 10% courier discount); daily tiffin quota multiplier (1–5); weekend add-ons
(Saturday +$15/wk, Sunday +$15/wk); optional student discount trigger (10%).

**Step 4 — Duration & invoice.** Commitment package (1/2/4/8/12 wk → 0/2/5/10/15% loyalty
discount). Live invoice from the pricing engine. **"Deploy Plan Formulation"** locks the
bundle and routes to checkout.

**Checkout Step 1 — Address & contact.** Full name, email, address. Canadian postal-code
prefix validated against `delivery_zones`: a match shows the regional slot window
(e.g. Mississauga 10:00 AM–1:00 PM); a non-served region offers a digital **waitlist** path.

**Checkout Step 2 — Payment simulation & grand review.** Receipt panel (recipient, matched
zone, pro-rated weekly fee, locked formula string). Simulated card inputs. **"Confirm
Subscription"** → Server Action:
1. Re-price authoritatively.
2. If not logged in, **auto-provision** a `user` (email + temp password `Tiffin123`, bcrypt-hashed).
3. Create the `subscription` (+ simulated `payment`), generate `deploymentId` `SUB-XXXX`.
4. Redirect to `/activate/[deploymentId]`.

**Activation screen.** Shows the `SUB-XXXX` deployment id, account-provisioned notice
(login with checkout email + `Tiffin123`), and the allocation-survey link
(`tiffingrab.ca/custom-allocation-form-v3`).

---

## 8. UI / design system

- shadcn/ui Nova preset (radix base, Lucide icons, Geist font) as the component baseline.
- The `impeccable` skill governs layout, hierarchy, spacing, and motion when building screens.
- Default shadcn theme tokens for the MVP; revamp deferred to subsystem F.

---

## 9. Testing

- **Vitest** unit tests: pricing engine (discount combinations, add-ons, quota, duration),
  effective-flag resolution (override vs default), postal-zone prefix matching.
- Smoke check: credential→session bridge issues a usable DB session.
- Seed determinism: re-running the seed is idempotent.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Next.js 16 renamed `middleware.ts` → `proxy.ts`; Auth.js docs predate it | Use `proxy.ts` with a `proxy` export; read `node_modules/next/dist/docs/` first |
| Auth.js v5 Credentials + DB sessions returns null sessions | Credential→session bridge; documented JWT fallback |
| Auth.js v5 on Next 16 is RC-era | Pin known-good versions; isolate auth in `lib/auth` for easy swaps |
| Pricing drift between wizard preview and checkout | Single shared pricing engine; checkout recomputes authoritatively |
| Monorepo restructure (app → `apps/web`) | One-time move; verify shadcn paths/`components.json` after |

---

## 11. Out of scope / follow-up (tracked in PROJECT.md)

- **D** Inquiries CRM (pipeline, sales-agent order creation, admin catalog editor).
- **E** Weekly-menu engine (release + per-day meal selection).
- **F** Marketing website revamp.
- Real payment gateway, email delivery, password reset, production hosting config.
