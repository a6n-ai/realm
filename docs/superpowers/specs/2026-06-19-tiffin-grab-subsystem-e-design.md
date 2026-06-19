# Tiffin Grab — Subsystem E Design Spec

**Date:** 2026-06-19
**Scope:** Subsystem E — weekly-menu engine: dishes catalog, admin meal-slot settings, weekly
menu release, and per-day/per-slot/per-person customer meal selection with cutoff locking and
defaults. Includes a bundled subsystem-C amendment (order model + pricing + wizard) that the
personalization model requires.
**Builds on:** Slice 1 (A/B/C), subsystem D (catalog editor, inquiries, orders), subsystem F.
**Deferred:** none after E — this completes the PROJECT roadmap (A–F).

---

## 1. Goals & non-goals

**Goals**
- Admins manage a **dishes** catalog and enable/disable **meal slots** (breakfast/lunch/dinner)
  as a global setting.
- Admins **release a weekly menu**: available dishes per day × enabled slot, with a per-week
  order cutoff and per-item defaults.
- Customers with an **active order** select a dish per delivery day × slot × person, filtered to
  their plan diet; selections **lock** at the cutoff and unfilled slots fall back to a **default**.
- Repurpose the order model for personalization: `dailyQty` → **persons**, plus an explicit set of
  **meal slots**, with pricing scaling by `persons × slots × days`.

**Non-goals (this slice)**
- Real delivery logistics / routing / driver assignment.
- Nutrition recomputation from chosen dishes (pricing stays meal-size-based).
- Per-slot or per-dish pricing (slots multiply a single meal-size base price; richer pricing is
  a follow-up).
- Notifications/reminders to pick before cutoff (noted as follow-up).
- Retroactively changing existing orders when a slot is enabled (non-retroactive by design).

---

## 2. Domain model & key decisions

- **Persons, not tiffin count.** `orders.dailyQty` is repurposed to `persons` (1–5, default 1):
  how many people the order feeds. Each person gets their own pick per slot.
- **Meal slots are a global admin setting**, not a per-menu setting. A `meal_slots` config row per
  slot carries `enabled`. Seeded with **lunch enabled, breakfast/dinner disabled** ("one meal
  initially"). The wizard, order, and menu builder all read enabled slots from here.
- **Slots live on the order.** `orders.mealSlots` (`text[]`, default `["lunch"]`, min 1) is captured
  at order time. Enabling a slot later is **non-retroactive** — existing orders keep their stored
  slots; only new orders can pick newly-enabled slots.
- **Pricing scales by persons × slots × days:**
  `weeklyFee = basePrice × persons × mealSlots.length × billableDays`, then add-ons, then
  courier → student → loyalty discounts (existing order/precedence unchanged).
- **Customer-visible slots per day** = `order.mealSlots ∩ enabled slots ∩ slots that have
  menu_items released for that day`.
- **Diet filter.** Plan `veg` → veg dishes; `halal_nonveg` → nonveg; `mixed` → both. (Mixed plans
  see veg and nonveg options each day — this is the per-day veg/nonveg flexibility.)

---

## 3. Data model

All tables use `baseColumns`/`updatableColumns` (subsystem A conventions). New `apps/web/db/schema/menu.ts`.

### 3.1 `meal_slots` *(updatable; admin config)*
- `key` text unique (`breakfast` | `lunch` | `dinner`)
- `label` text, `enabled` boolean (default false), `sortOrder` integer
- Seed: lunch `{enabled:true, sortOrder:1}`; breakfast `{enabled:false, sortOrder:0}`; dinner `{enabled:false, sortOrder:2}`.

### 3.2 `dishes` *(updatable; soft-delete via `active`)*
- `name` text, `description` text?, `diet` enum `dish_diet`(`veg`,`nonveg`)
- `slots` `text[]` (slot keys the dish suits, e.g. `["lunch","dinner"]`)
- `imageUrl` text?, `active` boolean default true
- Admin CRUD reuses the catalog-editor pattern; "delete" sets `active=false`.

### 3.3 `menu_weeks` *(updatable)*
- `weekStart` date unique (a Monday)
- `status` enum `menu_week_status`(`draft`,`released`) default `draft`
- `orderCutoff` timestamptz (after which selections lock)
- `releasedAt` timestamptz?

### 3.4 `menu_items` *(updatable)*
- `menuWeekId` uuid → menu_weeks (cascade delete)
- `dayOfWeek` enum `day_of_week`(`mon`,`tue`,`wed`,`thu`,`fri`,`sat`,`sun`)
- `slot` text (a slot key; must be enabled)
- `dishId` uuid → dishes
- `isDefault` boolean default false (the fallback pick for that day/slot)
- unique(`menuWeekId`,`dayOfWeek`,`slot`,`dishId`)

### 3.5 `meal_selections` *(updatable)*
- `orderId` uuid → orders (cascade delete)
- `menuWeekId` uuid → menu_weeks
- `dayOfWeek` enum `day_of_week`
- `slot` text
- `personIndex` integer (1..persons)
- `dishId` uuid → dishes
- unique(`orderId`,`menuWeekId`,`dayOfWeek`,`slot`,`personIndex`)

### 3.6 `orders` amendment (subsystem C)
- Rename column `daily_qty` → `persons` (keep value); update all refs (`orders.ts`, pricing,
  `createOrder`, wizard, agent order form, dashboard overview if it reads it).
- Add `mealSlots` `text[]` not null default `["lunch"]`.
- **Migration:** hand-authored (drizzle-kit needs a TTY for renames) — `ALTER TABLE "orders"
  RENAME COLUMN "daily_qty" TO "persons";` plus `ADD COLUMN "meal_slots" ...`; snapshot
  token-swapped like the subsystem-D orders rename. Existing rows: `persons` = old value,
  `meal_slots` = `{lunch}` via the column default.

---

## 4. Pricing engine amendment (`apps/web/lib/pricing`)

- `PricingSelections`: `dailyQty` → `persons`; add `mealSlots: string[]`.
- Engine: meal subtotal = `basePrice × persons × mealSlots.length × billableDays` where
  `billableDays` = frequency days/week + (Saturday add-on?1:0) + (Sunday add-on?1:0) (existing
  billable-day logic). Add-ons and discount order (courier → student → loyalty) unchanged.
- `buildPricingCatalog` validates `persons` 1–5 and `mealSlots` non-empty + all enabled.
- Update the Vitest engine suite for the new multiplier; keep all existing discount cases.

---

## 5. Delivery-day & selection logic (`apps/web/lib/menu`)

- **`orderDeliveryDays(order)`** → ordered `day_of_week[]`: from the order's frequency
  (`5_day`→mon–fri, `mwf`→mon/wed/fri) plus `includeSaturday`/`includeSunday`. Single source of
  truth, shared by pricing's billable-day count and the selection grid.
- **`visibleSlots(order, weekItems)`** → for a day: `order.mealSlots ∩ enabled ∩ slots present in
  menu_items for that day`.
- **`selectionsService`**:
  - `grid(orderId, menuWeekId)` → the day×slot×person matrix with available dishes (diet-filtered),
    current pick (or default), and `locked` flag (`now > menu_week.orderCutoff`).
  - `setSelection(orderId, menuWeekId, day, slot, personIndex, dishId)` → upsert on the unique
    tuple; **reject with `ValidationError` if locked**, if the dish isn't in that day/slot's
    menu_items, or if the dish diet doesn't match the order's plan.
  - `effectiveSelections(orderId, menuWeekId)` → picks with defaults applied for unfilled
    (day, slot, person): `menu_items.isDefault` for that day/slot, else the first available.
- **`menuService`** (admin): manage `menu_weeks` (draft/release/cutoff), `menu_items`
  (add/remove/setDefault — only for enabled slots), and `dishService` (CRUD + soft-delete).

---

## 6. API + UI

### 6.1 REST (existing `@tiffin/commons-next` factories)
- `/api/dishes` (+`[id]`,`query`) — admin guarded.
- `/api/meal-slots` (+`[id]`) — admin guarded (toggle enabled/sortOrder).
- Menu release + selections use **Server Actions** (transactional, cutoff-checked), not REST.

### 6.2 Dashboard pages
- **`/dashboard/settings/meal-slots`** (admin): enable/disable + reorder slots.
- **`/dashboard/dishes`** (admin): dish CRUD + soft-delete (catalog-editor pattern), diet + slot tags.
- **`/dashboard/menus`** (admin): week picker; per day × enabled slot, add/remove dishes, mark
  default; set `orderCutoff`; **Release**. Un-stubs the "Weekly Menus" sidebar item.
- **`/dashboard/meals`** (customer, `user` role; staff may view): active order + released week →
  day×slot×person grid of dish pickers; diet-filtered; locked banner past cutoff; shows defaults.
- Sidebar: add **Dishes**, **Weekly Menus**, **Meal slots** (admin); **My meals** (user). Role-gated.

### 6.3 Access
- Dish/slot/menu management: admin (`requireAdmin`).
- Meal selection: the order's owner (or staff on their behalf) — server action checks the order
  belongs to the session user, or the actor is staff.

---

## 7. Testing (Vitest)

- Pricing: `persons × slots × days` across frequency/add-on/discount combinations; existing
  discount cases still pass.
- `orderDeliveryDays`: 5_day, mwf, +Saturday/+Sunday.
- `selectionsService.setSelection`: upsert/replace (unique tuple), reject after cutoff, reject a
  dish not in the day/slot menu, reject a diet mismatch.
- `effectiveSelections`: default-fill unfilled slots (isDefault, else first available).
- Menu release: draft→released; menu_items only accept enabled slots.
- Migration/backfill: existing orders → `persons` (old value), `mealSlots=["lunch"]`.
- Full re-verify after the C amendment (tests + typecheck + build).

---

## 8. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| C amendment (orders rename + pricing + wizard) touches shipped code | Hand-authored rename migration + full re-verify; pricing is test-heavy |
| `daily_qty → persons` rename via drizzle-kit needs a TTY | Hand-author the migration + token-swap the snapshot (as in subsystem D) |
| Delivery-day logic drift between pricing billable-days and selection grid | Single shared `orderDeliveryDays`; pricing billable-day count derives from it |
| Slot enablement should not alter existing orders | `mealSlots` stored on the order; enabling is non-retroactive; default backfill `["lunch"]` |
| Defaults vs locking races (pick lands at cutoff) | `setSelection` re-checks `now > orderCutoff` server-side inside the action |
| Diet mismatch / dish not in menu submitted from client | Server action validates dish ∈ day/slot menu_items and diet ∈ plan before write |

---

## 9. Out of scope / follow-up (tracked in PROJECT.md)

- Per-slot / per-dish pricing; nutrition recomputation from chosen dishes.
- Pre-cutoff reminders / notifications; delivery routing.
- Bulk "apply this dish to the whole week" convenience; customer skip/pause a week.
