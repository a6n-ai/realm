# Customer Home + Catalog Browse — Design (Slice 1)

**Date:** 2026-07-14
**App:** `apps/tiffin-grab`
**Status:** Approved, ready for implementation plan
**Program:** Customer-experience revamp, Slice 1 of 6. Consumes Slice-0 motion primitives (`@/components/motion`). See `2026-07-12-customer-motion-foundation-design.md`.

## Goal

Revamp the customer home (`/me`) into a food-app-style browse experience: surface **this week's menu** (with dish photos), the **meal sizes** we offer, and a **dish gallery** — the three things the customer asked to "list" on the main page — alongside the existing subscription/wallet sections.

## Ground truth (codebase map, 2026-07-14)

- Home `app/(customer)/me/page.tsx` = vertical scroll of `<Suspense>` islands; order in `home-sections.ts`. Logged-in only (redirects `/login` if no userId). Sections today: subscription · browse-plans · coupons · wallet · analytics.
- `browse-plans-section.tsx` browses **plans** (text/gradient cards → `/subscribe`). No customer dish or meal-size browse exists. `wallet-section.tsx` already uses Slice-0 `AnimatedNumber`/`LottieEmptyState`.
- **Catalog model** (`db/schema/catalog.ts`):
  - `dishes`: `name`, `description` (nullable), `diet` (`veg|nonveg`), **`image` jsonb `FileDetail` (nullable)**, `category` (nullable soft-ref to `dish_categories.key`), `active`. **No `planType` column** — plan type is only loosely derivable via `category → dish_categories.planType`, and `category` is nullable. **Dishes are NOT cleanly plan-typed.**
  - `meal_sizes`: `key`, `name`, `planId` FK, `tier` (`budget|medium|premium`), `components` (jsonb `string[]`), `kcalMin/Max`, `proteinG/carbsG/fatG` (nullable), `basePrice` numeric. **No image, no description.**
  - `meal_size_items`: `mealSizeId` FK, `name`, `category`, `label`, `qty`, `weightValue`/`weightUnit`, `sortOrder`. No image.
  - `plans`: `key`, `name`, `description`, `planType`, `active`.
- **Weekly menu** (`db/schema/menu.ts`): `menu_weeks` (`planType`, `weekStart`, `status` draft|released, `orderCutoff`) × `menu_items` (`dayOfWeek`, `slot`=category key, `dishId` FK, `isDefault`, `position`). Read: `menuService.getPublishedWeek(planType, weekStart?)` (`lib/services/menu.service.ts:152`) → earliest released week, joins `menu_items → dishes`, returns `PosterItem[] = {dayOfWeek, slot, position, dishName, diet}` + slots + theme. **Does NOT select `dish.image`.** Cached (`publishedCache`). Marketing-only (`/menu/weekly`), tiffin default; not wired to customer home.
- `loadCatalogSnapshot()` (`lib/catalog/load.ts`) already loads `mealSizes[]` (with `items`, macros, `basePrice`, `tier`) + `plans[]`; cached. **Dishes are NOT in the snapshot.**
- `dishesService` (`lib/services/dishes.service.ts`) has only `create/update/delete` — **no read/list method.**
- Images: `dishes.image.url` served via `app/api/files/[...key]/route.ts` (public files cacheable). `PlanHero` (`plan-hero.tsx`) derives a deterministic gradient hue from a key — reuse as the imageless fallback.

## Decisions (locked)

- **Meal sizes = spec cards + a dish-photo slideshow.** No image column added (no migration). The slideshow pulls from the shared pool of active dishes that have images. Card body stays spec: components, kcal/macros, `$basePrice`.
- **Dishes gallery** = photo grid from all active dishes-with-images (not plan-scoped — dish plan-typing is not clean).
- **This-week menu** = plan-type-scoped via `getPublishedWeek`, keyed on the customer's subscription plan type (default `tiffin`).
- **Detail = a lightweight modal, no new routes.** Dish cards + weekly-menu items open a shared dish modal (photo, description, diet, "On the menu: <days>"). Meal-size card expands inline to its full item list.
- **No DB schema change.** Backend touch: (1) extend `getPublishedWeek`'s select + `PosterItem` to include `dish.image`; (2) add `dishesService.listActiveWithImages()`.
- Home stays logged-in only; all new sections render for the logged-in customer regardless of subscription state (browse encourages first/again purchase; subscribers see their week).

## Design

### Section order on `/me` (`home-sections.ts`)
1. Subscription / waitlist (existing — Slice 4)
2. **This week's menu** (new — visual hero)
3. **Meal sizes** (new)
4. **Dishes** (new)
5. Browse plans (existing)
6. Wallet (existing)
7. Coupons (existing)
8. Analytics (existing)

### A. This-week menu — `components/customer/home/this-week-menu-section.tsx`
- Data: `menuService.getPublishedWeek(planType)` where `planType` = the customer's active/waitlisted subscription plan type, else `"tiffin"`. Extend the service select + `PosterItem` to include `image: FileDetail | null` (marketing poster ignores the new field — additive).
- Render: day columns (Mon–Sun, or the days present), each listing its dishes as photo cards (photo or gradient fallback + name + diet dot). Tap a dish → shared dish modal.
- Empty (no released week for the plan type) → `LottieEmptyState` ("This week's menu drops soon").
- The customer's plan type is resolved once in the page loader and passed in.

### B. Meal sizes — `components/customer/home/meal-sizes-section.tsx`
- Data: `loadCatalogSnapshot().mealSizes` (already loaded for browse-plans — reuse, no new read) + the shared dish-photo pool (§D) for the slideshow.
- Card: a top **slideshow** (`DishSlideshow`, autoplay carousel of ~5 dish photos from the pool, reduced-motion → static first frame) + spec body: tier + plan name, `components.join(" · ")`, `~kcal` + macros, `$basePrice / meal`. Grouped by plan; expandable to the full `meal_size_items` list.
- No tap-to-subscribe requirement (browse-plans already links to `/subscribe`); the card is informational. (A "Choose this" CTA → `/subscribe` is acceptable if trivial.)

### C. Dishes — `components/customer/home/dishes-section.tsx`
- Data: `dishesService.listActiveWithImages()` (new read — see below).
- Render: responsive photo grid (`Reveal.Group` stagger, `Pressable` cards); tap → shared dish modal.
- Empty (no dishes with images) → `LottieEmptyState`.

### D. Shared pieces
- **New read** `dishesService.listActiveWithImages(): Promise<CustomerDish[]>` — `select` active dishes where `image is not null`, returning `{ publicId, name, description, diet, image, category }`, ordered by name. `CustomerDish` type exported for the components. This one read feeds both the Dishes section and the meal-size slideshows (loaded once in the page, passed to both).
- **`dish-modal.tsx`** (`"use client"`) — props `{ dish: CustomerDish, daysOnMenu?: string[] }`. Shows photo (or gradient fallback), name, diet, description, and "On the menu: Mon, Thu" when `daysOnMenu` is provided (derived from this-week `menu_items` for that dish — the this-week section passes it; the dishes gallery may omit it). Built on the existing `@realm/ui` dialog/drawer (responsive: drawer on mobile, dialog on desktop — mirror how other customer dialogs are done).
- **`DishSlideshow`** (`"use client"`) — autoplay image carousel over a `CustomerDish[]` subset; reduced-motion → static; pauses off-screen. Small, local to the meal-sizes section (not a shared package).
- **Image render + fallback** — a small `DishImage` helper: renders `image.url` (via `/api/files` path) with `max-width:100%`; when `image` is null, renders the `PlanHero`-style deterministic gradient + a food glyph. Used by dish cards, gallery, modal, slideshow.

### Motion (Slice 0 reuse — no new deps)
- `Reveal.Group` stagger on the menu day-columns, meal-size cards, and dish grid.
- `Pressable` on all tappable cards.
- `LottieEmptyState` for empty week / empty dishes.
- Dish modal enter/exit via the dialog's own transition (or a `motion` wrapper); slideshow crossfade via `motion`.

## Data flow

`me/page.tsx` loaders (added, each in its own `<Suspense>` island, mirroring existing pattern):
- resolve `planType` from `myActiveSubscriptions`/`myWaitlistedSubscriptions` (already loaded for the subscription section) → default `"tiffin"`.
- `getPublishedWeek(planType)` → this-week section.
- `loadCatalogSnapshot()` (already called for browse-plans) → meal-sizes section.
- `listActiveWithImages()` → dishes section + passed to meal-sizes for slideshows.
- days-on-menu map (dishId → weekday list) derived from the published week, passed to the dish modal via the this-week section.

## Non-goals

- No image column / migration for meal_sizes or plans.
- No new routes (detail is a modal).
- No plan-type filtering of the dish gallery/slideshow (dish plan-typing is not clean).
- No meal picking (Slice 2), no cutoff banner (Slice 2), no wallet rework (Slice 3).
- No change to the marketing `/menu`, `/pricing`, `/menu/weekly` pages.

## Testing / verify contract

- **Service tests** (live-DB, shared harness pattern from Slice 4): `listActiveWithImages` returns only active dishes with a non-null image, excludes inactive/imageless; `getPublishedWeek` now includes `image` in its items (extend the existing menu.service test).
- **Component tests** (jsdom, mock `@/components/motion` + image/file paths): this-week section renders day columns + opens the dish modal; meal-sizes section renders spec fields + a slideshow; dishes grid renders + opens modal; empty states render the Lottie empty. `DishImage` renders the gradient fallback when `image` is null.
- `pnpm turbo typecheck && pnpm turbo test`.
- Eyeball: `"use client"` on all new client components; dish photos load via `/api/files`; reduced-motion stops the slideshow.

## Risks

- **Pricing:** meal-size `$basePrice` is displayed read-only from the snapshot; no amount computed client-side (pricing stays server-side per AGENTS.md).
- **`getPublishedWeek` cache:** adding `image` to the select changes the cached shape — confirm `publishedCache`/`evictPublishedCache` still behave (shape change only; no key change).
- **Imageless catalog:** if few dishes have images, the gallery/slideshows look sparse — the gradient fallback keeps them presentable; flag to the user if the seed data has no dish images (the browser check will show this).
