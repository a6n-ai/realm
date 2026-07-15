# Customer Mobile Home + Nav Redesign — Design (Slice 6)

**Date:** 2026-07-15
**App:** `apps/tiffin-grab`
**Status:** Approved, ready for implementation plan
**Program:** Customer-experience revamp — follow-up polish after Slices 0–5.

## Goal

Declutter the mobile customer home (8 stacked sections → lean), move the catalog/menu content to a dedicated **Menu** nav destination, and add a prominent central **"Order" FAB → `/subscribe`** in the bottom nav (mirroring the admin center-FAB pattern).

## Ground truth (codebase map, 2026-07-15)

- **Home** (`app/(customer)/me/home-sections.ts` `HOME_SECTIONS` + `me/page.tsx`) = 8 Suspense sections in order: subscription · menu (this-week) · mealSizes · dishes · browse · coupons · wallet · analytics. Each is a prop-driven client component with a co-located async loader in `page.tsx` and a `*Skeleton` twin.
- The four **catalog sections** (`ThisWeekMenuSection`, `MealSizesSection`, `DishesSection`, `BrowsePlansSection`) are pure prop-driven components; their loaders copy verbatim to a new route. Only `menu` is session-scoped (needs `userId` → plan type); the other three are global.
- **Nav:** `CustomerBottomNav` (`customer-bottom-nav.tsx` `TABS`) + `CustomerSidebar` (`customer-sidebar.tsx` `NAV`) both carry 5 destinations: Home `/me`, Deliveries `/me/deliveries`, Meals `/me/meals`, Wallet `/me/wallet`, Profile `/me/profile`. Mounted via `CrmShell` in `app/(customer)/layout.tsx`.
- **`BottomNav`** (`packages/design-system/src/bottom-nav.tsx`) already supports a **raised center FAB** via `onFabClick` + `fabLabel` (renders a circular `-mt-6 size-14 rounded-full shadow-lg` PlusIcon button, splitting items left/right). Items are `{title, icon, active}` + `{href}` (Link) OR `{onClick}` (button). The FAB reads best with an **even tab count** (4 tabs + FAB). Admin uses it: `app-bottom-nav.tsx` passes `onFabClick`/`fabLabel="Create"`.
- **Wallet page** (`/me/wallet`, Slice 3) = hero + earn/spend tiles + log.
- **`/subscribe`** = the public wizard (the "Order" target).

## Decisions (locked)

- **Bottom nav = 4 tabs + center Order FAB:** `Home · Menu · [⊕ Order] · Deliveries · Wallet`. **Profile → header avatar** (top-right of the customer shell). **Meals → a link on the Deliveries page** (removed from the bottom bar; the meal picker stays at `/me/meals`).
- **Order FAB** navigates straight to `/subscribe` (no drawer).
- **Leanest mobile home:** `subscription` + `wallet` peek only. `menu`/`mealSizes`/`dishes`/`browse` → the new **Menu** page; `coupons` + `analytics` → the **Wallet** page (money/activity home).
- Desktop **sidebar** keeps all destinations (it has room) — Home, Menu, Deliveries, Meals, Wallet, Profile — so nothing is lost on desktop; only the mobile bottom bar is the constrained surface.

## Design

### A. New `/me/menu` route
- `app/(customer)/me/menu/page.tsx` — reuse the four catalog sections + their loaders **copied verbatim** from `me/page.tsx` (`MenuSectionData`, `MealSizesSectionData`, `DishesSectionData`, `BrowsePlansSectionData`), each in its own `<Suspense>` island with the existing `*Skeleton` fallback. Order: this-week menu · meal sizes · dishes · browse plans. Session (`currentUserId`) needed only for the menu section's plan type (same as home).

### B. Trim the home
- `home-sections.ts` `HOME_SECTIONS` → `[{ subscription }, { wallet }]` only. Remove menu/mealSizes/dishes/browse/coupons/analytics keys. Update the `HomeSectionKey` union.
- `me/page.tsx` → drop the removed branches + their loaders (the loader functions move: catalog ones to `me/menu/page.tsx`; coupons/analytics to `me/wallet/page.tsx`). Keep subscription + wallet islands.

### C. Move coupons + analytics to the Wallet page
- `me/wallet/page.tsx` — after the existing hero/tiles/log, add the `CouponsSection` + `AnalyticsTiles` islands (copy `CouponsSectionData` + `AnalyticsTilesData` loaders from `me/page.tsx`). They're already prop-driven with skeletons.

### D. Bottom nav restructure + Order FAB
- `CustomerBottomNav` (`"use client"`): `TABS` → Home, Menu (`/me/menu`), Deliveries, Wallet (4 items, drop Meals + Profile). Pass `onFabClick={() => router.push("/subscribe")}` + `fabLabel="Order"` to `<BottomNav>` (use `useRouter` from `next/navigation`; wrap in the Slice-0 view-transition if trivially compatible — else plain push). Add a `UtensilsCrossedIcon`/`MenuIcon` for the Menu tab.
- `CustomerSidebar` (desktop): keep all six destinations incl. Menu (add it), Meals, Profile.

### E. Profile → header avatar
- Add a profile avatar/icon link (→ `/me/profile`) to the top-right of the customer shell header (the `CrmShell` header slot used by the customer layout). Mobile + desktop. Reuse `@realm/ui` `Avatar` if a name/initial is available from the session; else a `UserIcon`. Confirm the `CrmShell` header/actions slot at plan time.

### F. Meals link on Deliveries
- On `/me/deliveries`, add a visible "Pick your meals →" `TransitionLink` to `/me/meals` (near the top / an action), so the meal picker stays reachable after leaving the bottom bar.

### G. Motion (Slice 0 reuse)
FAB press feedback (`Pressable`/BottomNav's own), view-transition nav where the app controls links, reduced-motion honored. No new deps.

## Non-goals
- No change to the section components themselves (they move, not change).
- No change to `/subscribe`, the wizard, catalog data, or any service/schema.
- No new catalog reads (loaders are copied, all reuse existing services — `loadCatalogSnapshot`/`getPublishedWeek`/`dishesService`/`couponsService`/`ledgerService`).
- No country-code/phone code (concurrent session's domain).

## Testing / verify contract
- **Component tests** (jsdom): `CustomerBottomNav` renders exactly 4 tabs + fires the Order FAB (→ router.push `/subscribe`); Home tab active on `/me`, Menu tab links `/me/menu`. Extend the existing `customer-bottom-nav.test.tsx`.
- **Order/route test:** `HOME_SECTIONS` now equals `["subscription","wallet"]`; a `/me/menu` order test asserts its 4 sections (mirror the Slice-1 `home-sections-order` test if a section list is exported).
- Reuse the existing catalog-section component tests unchanged (they move, props unchanged).
- `pnpm turbo typecheck && pnpm turbo test`.
- Eyeball (mobile viewport): home shows only subscription + wallet; bottom bar = Home/Menu/⊕Order/Deliveries/Wallet; ⊕ opens `/subscribe`; Menu page shows the catalog; Profile reachable via the header avatar; Deliveries has a "Pick meals" link; Wallet page now carries coupons + activity.

## Risks
- **`CrmShell` header/actions slot** for the profile avatar — confirm the slot exists (it's slot-based per repo rules); if not, add a minimal header action. Don't bake customer specifics into `crm-core` (inject via props).
- **FAB + view transitions** — if `onFabClick` + `startViewTransition` conflict, fall back to a plain `router.push`.
- **Even-tab requirement** — 4 tabs + FAB centers correctly; verify the split renders 2 left / 2 right.
- Low data risk: no new queries, no schema; purely IA/layout + moving existing prop-driven sections.
