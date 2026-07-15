# Customer Mobile Home + Nav Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lean mobile home (subscription + wallet peek only), a new `/me/menu` catalog page, coupons+analytics moved to the wallet page, and a bottom nav of 4 tabs + a center "Order" FAB → `/subscribe`.

**Architecture:** Pure IA/layout — move existing prop-driven sections + copy their loaders to new routes; add the already-built `BottomNav` FAB; add a profile avatar to the `CrmShell` `actions` slot. No new services, no schema, no section-component changes.

**Tech Stack:** Next.js 16, React 19, Vitest (jsdom), `BottomNav`/`CrmShell` from `@realm/design-system`/`@realm/crm`, Slice-0 motion.

## Global Constraints

- All in `apps/tiffin-grab`. **No DB schema change, no service change, no new queries** (loaders are copied verbatim). No country-code/phone code touched.
- Section components (`ThisWeekMenuSection`, `MealSizesSection`, `DishesSection`, `BrowsePlansSection`, `CouponsSection`, `AnalyticsTiles`, `WalletSection`, `SubscriptionSection`) MOVE unchanged — do not edit them.
- `crm-core` stays slot-based: inject the profile avatar via the existing `CrmShell` `actions` prop; don't bake customer specifics into the shell.
- `"use client"` on nav components; reduced-motion honored.
- Order the tasks so loaders are copied OUT (Tasks 1, 2) before the home is trimmed (Task 3).
- Verify gate after each task: `pnpm --filter tiffin-grab exec tsc --noEmit` + the task test. Final: `pnpm turbo typecheck && pnpm turbo test`.
- Worktree `/Users/lawbringr/IdeaProjects/realm-wt-2f09d8c4`, branch `wt/slice6-home-nav`. node_modules installed.

## Reuse reference (exact)

- `me/page.tsx` holds all loaders (copy verbatim): `SubscriptionSectionData(userId,timezone)`, `MenuSectionData(userId)`, `MealSizesSectionData()`, `DishesSectionData()`, `BrowsePlansSectionData()`, `CouponsSectionData()`, `WalletSectionData(userId)`, `AnalyticsTilesData(userId,timezone)` — each rendered in a `<Suspense fallback={<XSkeleton/>}>` island; the page maps `HOME_SECTIONS` (`home-sections.ts`) via a key-ternary.
- `BottomNav({ items, onFabClick?, fabLabel? })` (`packages/design-system`): renders a raised center FAB when `onFabClick` is set, splitting `items` into two halves. Items are `{title, icon, active}` + `{href}` or `{onClick}`.
- `CrmShell({ sidebar, center, actions?, bottomNav?, ... })` — `actions` renders top-right in the header (`ml-auto`, visible on mobile + desktop). `layout.tsx` currently passes `sidebar`/`center`/`bottomNav` (no `actions`).
- `CustomerBottomNav` (`customer-bottom-nav.tsx`): `TABS` array → `<BottomNav items={items}/>`. `CustomerSidebar` (`customer-sidebar.tsx`): `NAV` array. Both have 5 destinations today (Home/Deliveries/Meals/Wallet/Profile).
- `me/wallet/page.tsx` — a `MyWalletData` island (currentUserId, getAppSettings, walletService reads) rendering hero/tiles/log inside `<main>`.

## File Structure

- `app/(customer)/me/menu/page.tsx` — NEW catalog page.
- `app/(customer)/me/wallet/page.tsx` — add coupons + analytics islands.
- `app/(customer)/me/home-sections.ts` + `me/page.tsx` — trim to subscription + wallet.
- `components/customer/customer-bottom-nav.tsx` — 4 tabs + Order FAB.
- `components/customer/customer-sidebar.tsx` — add Menu.
- `app/(customer)/layout.tsx` + `components/customer/customer-profile-menu.tsx` (NEW) — header avatar.
- `app/(customer)/me/deliveries/delivery-calendar.tsx` — "Pick your meals" link.
- Tests colocated.

---

### Task 1: New `/me/menu` catalog route

**Files:**
- Create: `apps/tiffin-grab/app/(customer)/me/menu/page.tsx`
- Test: `apps/tiffin-grab/app/(customer)/me/menu/__tests__/menu-sections.test.ts`

- [ ] **Step 1: Read** `me/page.tsx` — copy the four catalog loaders VERBATIM: `MenuSectionData`, `MealSizesSectionData`, `DishesSectionData`, `BrowsePlansSectionData`, plus their imports (`menuService`, `loadCatalogSnapshot`, `toClientCatalog`, `selectablePlans`, `dishesService`, `myActiveSubscriptions`, `currentUserId`, the 4 section components + skeletons).

- [ ] **Step 2: Write the failing test**

Create `menu-sections.test.ts` — export a `MENU_SECTIONS` order const from the page module (or a sibling) and assert it:
```ts
import { MENU_SECTIONS } from "../menu-sections";
it("orders menu, mealSizes, dishes, browse", () => {
  expect(MENU_SECTIONS.map((s) => s.key)).toEqual(["menu", "mealSizes", "dishes", "browse"]);
});
```
(Add a small `me/menu/menu-sections.ts` exporting the order array — mirrors `home-sections.ts`.)

- [ ] **Step 3: Run it, verify it fails** — FAIL (module missing).

- [ ] **Step 4: Implement**

Create `me/menu/menu-sections.ts`:
```ts
export type MenuSectionKey = "menu" | "mealSizes" | "dishes" | "browse";
export const MENU_SECTIONS: readonly { key: MenuSectionKey; title: string }[] = [
  { key: "menu", title: "This week's menu" },
  { key: "mealSizes", title: "Meal sizes" },
  { key: "dishes", title: "Dishes" },
  { key: "browse", title: "Browse plans" },
];
```
Create `me/menu/page.tsx` — a `<main>` with a header ("Menu") + four `<Suspense>` islands (this-week, meal sizes, dishes, browse) using the copied loaders + their `*Skeleton` fallbacks. Resolve `currentUserId()` for `MenuSectionData` (redirect `/login` if null — this route is under the (customer) layout so it's session-gated anyway; mirror `me/page.tsx`).

- [ ] **Step 5: Run it, verify it passes** — GREEN.

- [ ] **Step 6: Typecheck + commit**
```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add "app/(customer)/me/menu" && git commit -m "feat(customer): /me/menu catalog page (this-week menu, sizes, dishes, browse)"
```

---

### Task 2: Coupons + analytics → wallet page

**Files:**
- Modify: `apps/tiffin-grab/app/(customer)/me/wallet/page.tsx`

- [ ] **Step 1: Read** `me/page.tsx` — copy `CouponsSectionData` + `AnalyticsTilesData` loaders VERBATIM (+ imports: `couponsService`, `CouponsSection`/`CouponsSectionSkeleton`, `AnalyticsTiles`/`AnalyticsTilesSkeleton`, `myDeliveries`, `ledgerService`, `monthWindow`). Note `AnalyticsTilesData` needs `timezone` — the wallet page already reads `getAppSettings()`, so grab `timezone` too.

- [ ] **Step 2: Implement**

In `me/wallet/page.tsx`, add two `<Suspense>` islands after the wallet `<Suspense>` (inside `<main>`): `<CouponsSectionData/>` and `<AnalyticsTilesData userId timezone/>`. Since the page's data island (`MyWalletData`) already resolves `userId`, either (a) thread `userId`/`timezone` out to sibling islands (resolve `currentUserId()` + `getAppSettings()` once at the page top and pass down), or (b) add self-contained loader islands that re-resolve (cache-backed reads make this cheap). Prefer (a): lift `currentUserId()` redirect to the page top, render the three islands (wallet / coupons / analytics) as siblings.

- [ ] **Step 3: Typecheck** — `cd apps/tiffin-grab && pnpm exec tsc --noEmit`. (No new unit test — the moved sections are already tested; verification is typecheck + the final gate.)

- [ ] **Step 4: Commit**
```bash
git add "app/(customer)/me/wallet/page.tsx"
git commit -m "feat(customer): move coupons + activity onto the wallet page"
```

---

### Task 3: Trim the mobile home

**Files:**
- Modify: `apps/tiffin-grab/app/(customer)/me/home-sections.ts`
- Modify: `apps/tiffin-grab/app/(customer)/me/page.tsx`
- Test: `apps/tiffin-grab/app/(customer)/me/__tests__/home-sections-order.test.ts` (update)

- [ ] **Step 1: Update the order test** (RED) — change the existing `home-sections-order.test.ts` expectation to:
```ts
expect(HOME_SECTIONS.map((s) => s.key)).toEqual(["subscription", "wallet"]);
```

- [ ] **Step 2: Run it, verify it fails** — FAIL (home still has 8).

- [ ] **Step 3: Implement**

- `home-sections.ts`: `HomeSectionKey = "subscription" | "wallet"`; `HOME_SECTIONS = [{ subscription, "Your subscription" }, { wallet, "Wallet" }]`.
- `me/page.tsx`: remove the `menu`/`mealSizes`/`dishes`/`browse`/`coupons`/`analytics` branches from the key-ternary AND delete their now-unused loader functions (`MenuSectionData`, `MealSizesSectionData`, `DishesSectionData`, `BrowsePlansSectionData`, `CouponsSectionData`, `AnalyticsTilesData`) + now-unused imports. Keep `SubscriptionSectionData` + `WalletSectionData` + their islands. Run `tsc` to catch any leftover unused import.

- [ ] **Step 4: Run it, verify it passes** — GREEN. Also `pnpm exec vitest run "app/(customer)/me/__tests__"`.

- [ ] **Step 5: Typecheck + commit**
```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add "app/(customer)/me/home-sections.ts" "app/(customer)/me/page.tsx" "app/(customer)/me/__tests__/home-sections-order.test.ts"
git commit -m "feat(customer): trim mobile home to subscription + wallet"
```

---

### Task 4: Bottom nav (4 tabs + Order FAB) + sidebar Menu

**Files:**
- Modify: `apps/tiffin-grab/components/customer/customer-bottom-nav.tsx`
- Modify: `apps/tiffin-grab/components/customer/customer-sidebar.tsx`
- Test: `apps/tiffin-grab/components/customer/__tests__/customer-bottom-nav.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Extend `customer-bottom-nav.test.tsx`:
```tsx
const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname, useRouter: () => ({ push }) }));
// ...
it("renders 4 tabs (Home/Menu/Deliveries/Wallet), not Meals/Profile", () => {
  render(<CustomerBottomNav />);
  ["Home", "Menu", "Deliveries", "Wallet"].forEach((t) => expect(screen.getByText(t)).toBeInTheDocument());
  expect(screen.queryByText("Profile")).toBeNull();
});
it("Order FAB navigates to /subscribe", () => {
  render(<CustomerBottomNav />);
  fireEvent.click(screen.getByRole("button", { name: /Order/i }));
  expect(push).toHaveBeenCalledWith("/subscribe");
});
```
(The `BottomNav` FAB renders `fabLabel` as its accessible name — confirm by reading `bottom-nav.tsx`'s FAB markup; adjust the query if it uses `aria-label`/title.)

- [ ] **Step 2: Run it, verify it fails** — FAIL.

- [ ] **Step 3: Implement**

- `customer-bottom-nav.tsx`: `TABS` → `[{ /me, Home }, { /me/menu, Menu, UtensilsCrossedIcon }, { /me/deliveries, Deliveries }, { /me/wallet, Wallet }]` (drop Meals + Profile; pick a Menu icon distinct from Deliveries — e.g. `UtensilsCrossedIcon` for Menu, keep `CalendarDaysIcon` for Deliveries). Add `useRouter`; pass `onFabClick={() => router.push("/subscribe")}` + `fabLabel="Order"` to `<BottomNav>`.
- `customer-sidebar.tsx`: add `{ title: "Menu", href: "/me/menu", icon: <a food icon> }` to `NAV` (keep all six incl. Meals + Profile — desktop keeps everything).

- [ ] **Step 4: Run it, verify it passes** — GREEN.

- [ ] **Step 5: Typecheck + commit**
```bash
cd apps/tiffin-grab && pnpm exec tsc --noEmit
git add components/customer/customer-bottom-nav.tsx components/customer/customer-sidebar.tsx components/customer/__tests__/customer-bottom-nav.test.tsx
git commit -m "feat(customer): bottom nav 4 tabs + center Order FAB; sidebar Menu"
```

---

### Task 5: Profile header avatar + Meals-on-Deliveries link

**Files:**
- Create: `apps/tiffin-grab/components/customer/customer-profile-menu.tsx`
- Modify: `apps/tiffin-grab/app/(customer)/layout.tsx`
- Modify: `apps/tiffin-grab/app/(customer)/me/deliveries/delivery-calendar.tsx`
- Test: `apps/tiffin-grab/components/customer/__tests__/customer-profile-menu.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `customer-profile-menu.test.tsx` (jsdom): renders a link to `/me/profile` with the user's initial/avatar.
```tsx
render(<CustomerProfileMenu user={{ name: "Asha", email: "a@x.com", image: null }} />);
expect(screen.getByRole("link", { name: /profile|Asha/i })).toHaveAttribute("href", "/me/profile");
```

- [ ] **Step 2: Run it, verify it fails** — FAIL.

- [ ] **Step 3: Implement**

- `customer-profile-menu.tsx` (`"use client"` if it needs interactivity, else a plain link): a `next/link` (or Slice-0 `TransitionLink`) to `/me/profile` wrapping `@realm/ui` `Avatar` (image or initial from `name`/`email`), sized for a header (`size-8`), `aria-label="Profile"`.
- `layout.tsx`: pass `actions={<CustomerProfileMenu user={{ name: user.name ?? null, email, image: user.image ?? null }} />}` to `<CrmShell>` (the `actions` slot already renders top-right on mobile + desktop).
- `delivery-calendar.tsx`: add a "Pick your meals →" `TransitionLink` (or `Link`) to `/me/meals` near the top of the deliveries view (an action row or under the header), so the meal picker stays reachable after leaving the bottom bar.

- [ ] **Step 4: Run it, verify it passes** — GREEN.

- [ ] **Step 5: Full verify gate**

Run: `cd /Users/lawbringr/IdeaProjects/realm-wt-2f09d8c4 && pnpm turbo typecheck && pnpm turbo test`
Expected: typecheck clean; nav/menu/home + moved-section suites pass; note any PRE-EXISTING unrelated failures (same known set), touched files pass.

- [ ] **Step 6: Manual browser check (mobile viewport)**

Log in as a `user`: home shows only subscription + wallet peek; bottom bar = Home / Menu / ⊕Order / Deliveries / Wallet; ⊕ → `/subscribe`; Menu page shows the catalog; the header top-right avatar → `/me/profile`; Deliveries has a "Pick your meals" link; the wallet page now shows coupons + activity below the log.

- [ ] **Step 7: Commit**
```bash
git add components/customer/customer-profile-menu.tsx "app/(customer)/layout.tsx" "app/(customer)/me/deliveries/delivery-calendar.tsx" components/customer/__tests__/customer-profile-menu.test.tsx
git commit -m "feat(customer): profile header avatar + Pick-your-meals link on deliveries"
```

---

## Self-Review

**Spec coverage:**
- New `/me/menu` catalog route → Task 1. ✓
- Coupons + analytics → wallet page → Task 2. ✓
- Lean home (subscription + wallet) → Task 3. ✓
- Bottom nav 4 tabs + Order FAB → `/subscribe`; sidebar keeps all + Menu → Task 4. ✓
- Profile → header avatar; Meals → deliveries link → Task 5. ✓
- No service/schema change; sections moved unchanged → held. ✓

**Placeholder scan:** Tasks 1 & 2 instruct "copy the loaders verbatim from `me/page.tsx`" rather than re-transcribing ~40 lines of loader bodies — the source is in-repo and exact, and re-typing risks drift; this is a copy-from-named-source, not a vague placeholder. The Menu-tab icon and the `BottomNav` FAB accessible-name are marked "confirm by reading the component" (real read-then-match). All new files (menu-sections, profile-menu) + edits are fully specified.

**Type consistency:** `HOME_SECTIONS`/`HomeSectionKey` trimmed to `subscription|wallet` (Task 3) — `me/page.tsx`'s ternary must only reference those. `MENU_SECTIONS` (Task 1) is independent. The moved loaders keep their existing prop contracts to the section components (unchanged). `CustomerProfileMenu` user prop matches the `layout.tsx` shape already passed to `CustomerSidebar`.

**Ordering note:** Tasks 1 & 2 copy the catalog + coupons/analytics loaders OUT before Task 3 deletes them from `me/page.tsx` — so no loader is lost. Verified in the task sequence.
