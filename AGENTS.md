<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Realm — agent guide

Realm is a **multi-client Turborepo of apps** (TiffinGrab, Puchkaman). Shared packages live in `foundry/` as `@foundry/*` (Monarch AI packages go there too). Notifications live in `relay/` (`@relay/engine`, `@relay/email`, `@relay/sdk`). Orientation:
[`PROJECT.md`](PROJECT.md) (product + roles + roadmap) and
[`docs/realm/`](docs/realm/) (structure, add-a-client, add-a-package, dev/build).

## Before you edit

- **New to a package?** Read `docs/realm/repo-structure.md` — the taxonomy and the
  acyclic dependency layering. Do not create import cycles.
- **Fixing a bug?** Fix it at the shared root, not per-caller. Most shared logic
  lives in a `@foundry/*` package that many callers route through.
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

- Prefer customer Finances as a hub at `/me/wallet` (tabs), not a bottom-nav item; keep money billing (monthly bills/transactions) under Finances, not Deliveries History; mobile bottom nav uses Account, with wallet and theme controls in the header; on mobile admin/customer shells prefer top-left brand and More/bottom nav over a persistent sidebar; tiffin-grab customer `/me` uses Apple HIG (warm neutrals + saffron), not Puchkaman brutalism.
- Prefer admin inquiry and order create forms stay aligned (catalog plan/interest pills, not free-text meals; optional sub-source pills; hide meal sizes until veg/non-veg/healthy; email required as the login path; Vaul top drawer on mobile) so inquiry can convert to order later; reject convert when an active order already exists for that inquiry.
- Prefer mobile-first subscribe/checkout UX with clear back/close and an obvious Order FAB purpose; when a logged-in customer starts another subscription, show soft per-step current-plan context (meals, weeks already covered) rather than blocking a second subscription. **Concurrent plans are not allowed** (confirmed 2026-08-17): `createOrder` rejects an order whose delivery window overlaps an `active`/`paused` one, because both would reserve the same calendar days. Sequential plans are fine — the soft hints above apply to those, and the Deliveries sub-switcher still appears when a customer has a running plan plus a future-dated one. Do not "fix" that guard away.
- Customer support ticketing must exist in the customer app (not staff-only), stay mobile-friendly, and allow attaching a related order/subscription plus photo/screenshot uploads on create.
- Entire app (including weekly menu `weekStart`) must follow the admin app-settings timezone; Menu and Deliveries resolve released weeks through the same `menuService` API with no cross-week fallback; Home "This week's menu" shows Mon–Sun columns with empty days as label-only (no placeholder/underline).
- Prefer one shared commons address form for checkout, profile, and per-delivery address entry (Google Places can plug in later).
- Split account/profile by concern with role gating: Profile = basic info; Security = password/PIN; Address, Notifications, Dietary, and Support on their own pages (dietary is customer-only; Support at `/me/support`); desktop uses tabs like Finances; mobile uses the account hub sections.
- Deliveries should show total and remaining tiffins and hold days count (count tiffins, not days; no "Skips done" stat); calendars default selected day to today on mount; hold/skip/vacation misses after cutoff go to a remaining pool; no standalone Skip action (reschedule/hold instead); paused/skipped days support explicit reschedule to a calendar date (consumes a hold day; rescheduled deliveries cannot be unpaused); makeup only after the current last delivery on the plan's weekday pattern; vacation uses start/end date pickers in a bottom drawer (not a range or system calendar), start may be today (inclusive) even if today's delivery cutoff has passed, and resume appends undelivered days after that last day; locked/delivered days use an emerald circle around the date (legend Delivered, not Locked/padlock); customer-facing plan name is the meal size with diet as a side pill, Active as a pill, plan box using admin `tagColor`, and renew countdown from the last tiffin date; meal chips use `formatTuHuman` (oz/roti), never raw TU.
- Prefer Settings → Integrations (plugin cards) separate from per-plugin Settings entries that appear after install (Payment tabs after payment plugins; Clover after Clover is installed); hide Clover sync and Clover-only features until the plugin is installed; when installed, put Products, Orders, Finance, and Employees under a Clover sidebar section (non-Clover overview stays outside); payment method settings appear only after a payment plugin is added; support e-Transfer/Stripe-style methods with per-method taxes and method-gated coupons; offline methods should allow payment details or proof photo; defer coupon/coin awards until payment verification; allow starting deliveries immediately while messaging fulfillment waits on confirmation (shift dates if never confirmed); for puchkaman inventory, Clover POS is source of truth (Uber Eats for images only; Uber-only products stay listed as out of stock); never rewrite applied migrations.
- Admin order detail should mirror customer deliveries UI (calendar + skip/vacation/reschedule/meal controls) so staff can guide customers; drop customer-absent sections (e.g. lifecycle); Summary and Payment as side-by-side top cards with full pricing snapshot; paginated activity log with actor and filters aligned with order listing; admin payment creation selects method, sends customer a payment link, and redirects staff to order details (not the customer checkout success screen); reuse same APIs with owner-or-admin auth.
- Prefer puchkaman admin login/dashboard to reuse shared CRM/`@foundry/*` and `@foundry/auth-ui` security screens like tiffin-grab (same elements, single auth logo; match buttons/filters/radius; listings use ReUI facet filters and PageHeader actions like tiffin orders/inquiries; skeletons match live CRM layouts); light theme should use public yellow+green brand colors (not white+yellow, yellow+red, or the tiffin-grab palette; red is status/destructive only), with theme preference shared across public and admin; reserve brutalist styling for public/customer surfaces only (admin sync dialogs and Uber Eats completed/review UI stay CRM/`@foundry/ui`, not brutal); do not extract orders/finance into separate packages for Clover reuse (keep app-local); put shared CRM admin commons in `@foundry/crm`/`crm-core` and Clover-specific pieces in `@foundry/clover`; public menu is the product list (OOS visible but not addable; no browsing-only banner); public ink/black buttons use white text; admin Finance hosts Transactions + Ledger with the same filter/sort UX; product detail should expose Clover fields (including color swatch) and support single-product sync; name commerce entities like tiffin-grab (`orders`/`payments`/`ledger_entries`, never `website_*`) and persist via the shared abstract UpdatableService/Repository layer.
- When asked to push, user expects changes pushed directly to main.

## Learned Workspace Facts

- Customer Finances hub lives at `/me/wallet` (nav label Finances) with `?tab=` Coins | Bills | Transactions; Coins use `wallet_ledger`, while Bills/Transactions (money “monthly bills”) use prepaid `orders` / `payments` / `ledger_entries` — no separate monthly-invoice entity yet; bottom nav is Home | Menu | Deliveries | Account with center FAB to `/subscribe` (Order); wallet balance and theme toggle live in the header (`CustomerHeaderActions`).
- Customer `/me/deliveries` is calendar-focused (delivery History UI removed); loads one calendar month at a time via `?month=YYYY-MM`; shows total/remaining tiffins and hold days count; plan header uses `PlanBox` (dropdown only when multiple active subs) with meal size as the title, diet as a side pill, Active as a pill, admin `tagColor` on the box, and renew countdown from last tiffin date; meal chips use `formatTuHuman`; delivered/locked days (`DayStatus` `"locked"`) render as an emerald circle on the date with legend Delivered; vacation/pause is per subscription via `VacationControl` and `subscription_pauses` (start required, may be today; optional end; today's passed cutoff does not block vacation start for upcoming days; confirmation before pause/resume); UI “On Hold” maps to `skipped`, vacation to `paused`; paused/skipped days support calendar-target reschedule (consumes hold day; cannot unpause after reschedule); makeup for missed tiffins appends after `max(delivery_date)` on plan weekdays.
- Subscribe flow is public Wizard → Checkout; `ExistingSubscriptions` lists active plans above the wizard, and soft current-plan hints use `CurrentPlanHint` in wizard steps.
- Released menu weeks for customer Menu and Deliveries go through `menuService.getReleasedWeek(s)` with `weekStart` = Monday in the app-settings timezone (exact match; Menu does not fall back to another published week); delivery tiles always show for scheduled days, and menu options attach only when that delivery's week is released — Menu answers "what's published to browse this week?" while Deliveries answers "what's released for this delivery date's week?"
- Dashboard account sections are role-gated by `ACCOUNT_NAV` (staff: profile + security; customers also get address, dietary, delivery notes, notifications, support); customer account hub lives at `/me/account`, Support at `/me/support` — avoid dumping every profile subsection onto a single `/me/profile` page.
- Cross-app support ticket/chat UI belongs in `@foundry/design-system` (composed UI), not `@foundry/ui`.
- Admin Settings splits Integrations (plugins) from Payments (per-method tabs after plugins are enabled); payment config still lives under `@foundry/payments` / settings payments UI with per-method taxes, method-scoped coupons, and proof upload; coupon/coin settlement waits on payment verification; checkout may create deliveries while payment is pending and can shift the schedule if unconfirmed.
- Admin inquiry/order create share lead UX (`_leads/plan-interest-fields`, source/sub-source pills); interest uses catalog plans/meal sizes (not free-text); email is required; mobile sheets use Vaul top drawer via `@foundry/design-system` `responsive-dialog`. Admin order detail at `/dashboard/orders/[id]` mirrors customer delivery calendar/controls with Summary + Payment side cards and paginated activity log.
- Clover lives in reusable `@foundry/clover` (OAuth/setup/auth, inventory/employees clients, Clover-only UI/plugin); shared non-Clover CRM admin commons belong in `@foundry/crm`/`crm-core` — do not create orders/finance packages for Clover reuse (those domains stay app-local). Available via Settings → Integrations (install) and Settings → Clover (connect/settings after install); when installed, puchkaman admin Products/Orders/Finance/Employees sit under the Clover nav. App ID/Secret come from Clover Developer App Settings (not the merchant API tokens page) and live in server env (`CLOVER_APP_ID`/`CLOVER_APP_SECRET`); merchant OAuth tokens from Connect are stored in app `integrations_config`. For puchkaman, Clover POS inventory is source of truth (Uber Eats images only; Uber-only products stay out of stock); website checkout uses Clover iframe + pay-for-order into `orders`/`payments`/`ledger_entries` (no `website_` prefix), with webhooks primary and admin Check status fallback; employees sync supports assigning orders to Clover employees.
- Puchkaman admin Finance lives at `/dashboard/finance` (Transactions + Ledger tabs, ReUI filter/sort like products/orders; under Clover nav when Clover is installed); product detail pages expose Clover inventory fields (including item color swatch) and support single-product sync; entity saves go through the shared abstract UpdatableService/Repository layer; never rewrite applied migrations.
- Puchkaman public menu (`/eats`) is the sellable product list: show Available/Out of stock, allow Add to cart only when orderable, and skip browsing-only/Clover-link explainer banners; public ink/black buttons use white text (including default, not only hover). Admin/auth uses scoped CRM styling (`crm.css` / shared shell patterns) so marketing `globals.css` resets do not leak into CRM; neobrutalist/brutal components stay on the public site; public and admin share one theme preference; light CRM tokens reuse public yellow+green brand colors (red for destructive/status only).
- Admin user management runs on the Better Auth `admin` plugin in both apps, configured
  with a per-app `createAccessControl` statement (`apps/*/lib/auth/permissions.ts`).
  Shared primitives live in `@foundry/auth` (`baseStatement`, `createPermissionGuards`);
  the invite dialog lives in `@foundry/crm`. `requireAdmin`/`requireStaff` still exist for
  old call sites; new code uses `requirePermission({ resource: ["action"] })`.
  Deliberately unmounted: ban/unban (users.status is the only sign-in switch),
  `removeUser` (hard delete — use `usersService.softDelete`), impersonation, and
  `adminClient()` (it would pull server-only `@foundry/auth` into the browser bundle).
  Invites create the account with NO credential and mail an OTP; `onPasswordReset`
  flips `passwordSet`. puchkaman has three roles. `admin` runs the console at
  `/dashboard`; `user` is a customer, signs in by email OTP, and lives at `/me`;
  `member` is invitable but no `/dashboard` page admits it yet (they all call
  `requireAdmin`), so it lands on `/no-access` until that audit happens.
  The `users.role` column defaults to `user` (migration `0017`) — deliberately
  fail-closed, since `user` is the role with no console permissions.
