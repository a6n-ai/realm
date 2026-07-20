<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Realm — agent guide

Realm is a **multi-client Turborepo**: one platform, many Next.js client apps
sharing `@realm/*` packages. `apps/tiffin-grab` is the first client. Orientation:
[`PROJECT.md`](PROJECT.md) (product + roles + roadmap) and
[`docs/realm/`](docs/realm/) (structure, add-a-client, add-a-package, dev/build).

## Before you edit

- **New to a package?** Read `docs/realm/repo-structure.md` — the taxonomy and the
  acyclic dependency layering. Do not create import cycles.
- **Fixing a bug?** Fix it at the shared root, not per-caller. Most shared logic
  lives in a `@realm/*` package that many callers route through.
- **Product/client-specific code** stays in `apps/<client>` until a *second* client
  proves it is genuinely shared — only then does it graduate to a package.

## Package rules (keep the graph acyclic)

- `commons`/`themes` are the floor. `ui` imports `themes`; `design-system` composes
  `ui`; `crm-core` composes `ui` + `design-system`. Lower layers never import up.
- **`crm-core` never imports an app.** `<CrmShell>` is slot-based — nav, breadcrumbs,
  actions, footer, `getSession`, role groupings are injected as props, never baked in.
- Packages ship **raw `.ts`/`.tsx`** (no build step). Client-consumed packages must be
  in `apps/<client>/next.config.ts` `transpilePackages`. Server-only packages
  (`commons-files`, `commons-notify`, `auth`) are NOT transpiled.

## Verify contract

Packages ship source, so `tsc` is the fast gate — it resolves every workspace import.
After a non-trivial change:

```bash
pnpm turbo typecheck && pnpm turbo test
```

Two things `tsc` cannot catch — verify by eye when touching client components:
1. A stripped/missing `"use client"` directive.
2. A client symbol demoted from a named export (the `Component.Skeleton` trap).

## Conventions

- TypeScript everywhere; comment the non-obvious *why* only.
- `rg`/`fd` over `grep`/`find`.
- Pricing/totals computed **server-side only** — never trust client-submitted amounts.
- Audit fields (`created_by`/`updated_by`) stamped from the session, never from input.
- **Next.js 16:** route protection lives in `proxy.ts` (renamed `middleware.ts`).
  Read `node_modules/next/dist/docs/` before writing framework code.

## Learned User Preferences

- Prefer customer Finances as a hub at `/me/wallet` (tabs), not a bottom-nav item; mobile bottom nav uses Account instead, with wallet and theme controls in the header.
- Keep delivery fulfillment separate from money billing; monthly bills and money transactions belong under Finances, not under Deliveries History.
- When matching the customer deliveries calendar to reference screenshots, prioritize the mobile viewport and avoid selected-day fills that clash with status legend colors (use brand primary, not green/`bg-ok`).
- Prefer mobile-first subscribe/checkout UX with clear back/close; the customer Order FAB should make its subscribe/order purpose obvious.
- When a logged-in customer starts another subscription, show soft per-step current-plan context (meals, weeks already covered) rather than blocking a second subscription.
- Customer home and deliveries calendars should default the selected day to today on mount.
- Deliveries plan header uses flat summary text (`SubscriptionPlanSummary`), not pills/chips; show subscription dropdown only when the customer has multiple active subscriptions.
- Home "This week's menu" should show Mon–Sun columns; days with no dishes render only the day label (no placeholder or underline).
- Customer Menu and Deliveries must resolve released menu weeks through the same `menuService` API (no cross-week fallback on Menu).
- Prefer one shared commons address form for checkout, profile, and per-delivery address entry (Google Places can plug in later).
- Split account/profile by concern with role gating: Profile = basic info; Security = password/PIN; Address, Notifications, and Dietary on their own pages (dietary is customer-only); desktop uses tabs like Finances; mobile uses the account hub sections.
- Deliveries vacation/pause: start date required, optional end date; confirm pause scope (open-ended from start vs date range) before applying.

## Learned Workspace Facts

- Customer Finances hub lives at `/me/wallet` (nav label Finances) with `?tab=` Coins | Bills | Transactions; Coins use `wallet_ledger`, while Bills/Transactions use `orders` / `payments` / `ledger_entries`.
- Customer `/me/deliveries` is calendar-focused (delivery History UI removed); loads one calendar month at a time via `?month=YYYY-MM` (all delivery days in month; menu for each released week in that range).
- Money “monthly bills” map to prepaid `orders` (+ nested `payments`), not coin wallet rows or delivery rows; there is no separate monthly-invoice entity yet.
- Subscribe flow is public Wizard → Checkout; `ExistingSubscriptions` lists active plans above the wizard, and soft current-plan hints use `CurrentPlanHint` in wizard steps.
- Customer bottom nav is Home | Menu | Deliveries | Account with center FAB to `/subscribe` (Order); wallet balance and theme toggle live in the header (`CustomerHeaderActions`).
- Home week strip and deliveries calendars initialize the selected day to today.
- Released menu weeks for customer Menu and Deliveries go through `menuService.getReleasedWeek(s)` (exact `weekStart`; Menu no longer falls back to another published week).
- Deliveries calendar month navigation updates `?month=`; delivery tiles always show for scheduled days; menu options attach only when that delivery's week is released (`menuService.getReleasedWeeks`).
- Menu page answers "what's published to browse this week?" while Deliveries answers "what's released for this delivery date's week?" — same API gate, different per-surface questions.
- Deliveries vacation/pause is per subscription via `VacationControl` and `subscription_pauses` (start required; optional end; confirmation before pause/resume).
- Dashboard account sections are role-gated by `ACCOUNT_NAV` (staff: profile + security; customers also get address, dietary, delivery notes, notifications).
- Customer account hub lives at `/me/account`; avoid dumping every profile subsection onto a single `/me/profile` page.
