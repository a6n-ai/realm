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

- Prefer customer Finances as a hub at `/me/wallet` (tabs), not a bottom-nav item; keep money billing (monthly bills/transactions) under Finances, not Deliveries History; mobile bottom nav uses Account, with wallet and theme controls in the header; on mobile admin/customer shells prefer top-left brand and More/bottom nav over a persistent sidebar.
- Prefer admin inquiry and order create forms stay aligned (catalog plan/interest pills, not free-text meals; optional sub-source pills; hide meal sizes until veg/non-veg/healthy; email required as the login path; Vaul top drawer on mobile) so inquiry can convert to order later; reject convert when an active order already exists for that inquiry.
- Prefer mobile-first subscribe/checkout UX with clear back/close and an obvious Order FAB purpose; when a logged-in customer starts another subscription, show soft per-step current-plan context (meals, weeks already covered) rather than blocking a second subscription.
- Customer support ticketing must exist in the customer app (not staff-only), stay mobile-friendly, and allow attaching a related order/subscription plus photo/screenshot uploads on create.
- Entire app (including weekly menu `weekStart`) must follow the admin app-settings timezone; Menu and Deliveries resolve released weeks through the same `menuService` API with no cross-week fallback; Home "This week's menu" shows Mon–Sun columns with empty days as label-only (no placeholder/underline).
- Prefer one shared commons address form for checkout, profile, and per-delivery address entry (Google Places can plug in later).
- Split account/profile by concern with role gating: Profile = basic info; Security = password/PIN; Address, Notifications, Dietary, and Support on their own pages (dietary is customer-only; Support at `/me/support`); desktop uses tabs like Finances; mobile uses the account hub sections.
- Deliveries should show total and remaining tiffins and hold days count (count tiffins, not days; no "Skips done" stat); calendars default selected day to today on mount; hold/skip/vacation misses after cutoff go to a remaining pool; paused/skipped days support explicit reschedule to a calendar date (consumes a hold day; rescheduled deliveries cannot be unpaused); makeup only after the current last delivery on the plan's weekday pattern; vacation uses start/end date pickers (not a range calendar) and resume appends undelivered days after that last day.
- Prefer Settings → Integrations (plugin cards) separate from per-plugin Settings entries that appear after install (Payment tabs after payment plugins; Clover after Clover is installed); payment method settings appear only after a payment plugin is added; support e-Transfer/Stripe-style methods with per-method taxes and method-gated coupons; offline methods should allow payment details or proof photo; defer coupon/coin awards until payment verification; allow starting deliveries immediately while messaging fulfillment waits on confirmation (shift dates if never confirmed).
- Admin order detail should mirror customer deliveries UI (calendar + skip/vacation/reschedule/meal controls) so staff can guide customers; drop customer-absent sections (e.g. lifecycle); Summary and Payment as side-by-side top cards with full pricing snapshot; paginated activity log with actor and filters aligned with order listing; admin payment creation selects method, sends customer a payment link, and redirects staff to order details (not the customer checkout success screen); reuse same APIs with owner-or-admin auth.
- Prefer puchkaman admin login/dashboard to reuse shared CRM/`@realm/*` and `@realm/auth-ui` security screens like tiffin-grab (same elements, single auth logo; match buttons/filters/radius; listings use ReUI facet filters and PageHeader actions like tiffin orders/inquiries; skeletons match live CRM layouts); light theme should use public yellow+red brand colors (not white+yellow or the tiffin-grab palette), with theme preference shared across public and admin; reserve brutalist styling for public/customer surfaces only (admin sync dialogs and Uber Eats completed/review UI stay CRM/`@realm/ui`, not brutal).
- When asked to push, user expects changes pushed directly to main.

## Learned Workspace Facts

- Customer Finances hub lives at `/me/wallet` (nav label Finances) with `?tab=` Coins | Bills | Transactions; Coins use `wallet_ledger`, while Bills/Transactions (money “monthly bills”) use prepaid `orders` / `payments` / `ledger_entries` — no separate monthly-invoice entity yet.
- Customer `/me/deliveries` is calendar-focused (delivery History UI removed); loads one calendar month at a time via `?month=YYYY-MM`; shows total/remaining tiffins and hold days count; plan header uses flat `SubscriptionPlanSummary` (dropdown only when multiple active subs).
- Subscribe flow is public Wizard → Checkout; `ExistingSubscriptions` lists active plans above the wizard, and soft current-plan hints use `CurrentPlanHint` in wizard steps.
- Customer bottom nav is Home | Menu | Deliveries | Account with center FAB to `/subscribe` (Order); wallet balance and theme toggle live in the header (`CustomerHeaderActions`).
- Released menu weeks for customer Menu and Deliveries go through `menuService.getReleasedWeek(s)` with `weekStart` = Monday in the app-settings timezone (exact match; Menu does not fall back to another published week); delivery tiles always show for scheduled days, and menu options attach only when that delivery's week is released — Menu answers "what's published to browse this week?" while Deliveries answers "what's released for this delivery date's week?"
- Deliveries vacation/pause is per subscription via `VacationControl` and `subscription_pauses` (start required; optional end; confirmation before pause/resume); UI “On Hold” maps to `skipped`, vacation to `paused`; paused/skipped days support calendar-target reschedule (consumes hold day; cannot unpause after reschedule); makeup for missed tiffins appends after `max(delivery_date)` on plan weekdays.
- Dashboard account sections are role-gated by `ACCOUNT_NAV` (staff: profile + security; customers also get address, dietary, delivery notes, notifications, support); customer account hub lives at `/me/account`, Support at `/me/support` — avoid dumping every profile subsection onto a single `/me/profile` page.
- Cross-app support ticket/chat UI belongs in `@realm/design-system` (composed UI), not `@realm/ui`.
- Admin Settings splits Integrations (plugins) from Payments (per-method tabs after plugins are enabled); payment config still lives under `@realm/payments` / settings payments UI with per-method taxes, method-scoped coupons, and proof upload; coupon/coin settlement waits on payment verification; checkout may create deliveries while payment is pending and can shift the schedule if unconfirmed.
- Admin inquiry/order create share lead UX (`_leads/plan-interest-fields`, source/sub-source pills); interest uses catalog plans/meal sizes (not free-text); email is required; mobile sheets use Vaul top drawer via `@realm/design-system` `responsive-dialog`. Admin order detail at `/dashboard/orders/[id]` mirrors customer delivery calendar/controls with Summary + Payment side cards and paginated activity log.
- Clover Phase 1 lives in reusable `@realm/clover` with shared `@realm/clover/ui` (OAuth/setup/auth; payments/inventory/orders deferred); available to puchkaman and tiffin-grab via Settings → Integrations (install) and Settings → Clover (connect/settings after install, same gate as payment tabs); App ID/Secret come from Clover Developer App Settings (not the merchant API tokens page) and live in server env (`CLOVER_APP_ID`/`CLOVER_APP_SECRET`); merchant OAuth tokens from Connect are stored in app `integrations_config`.
- Puchkaman admin/auth uses scoped CRM styling (`crm.css` / shared shell patterns) so marketing `globals.css` resets do not leak into CRM; neobrutalist/brutal components stay on the public site; public and admin share one theme preference; light CRM tokens reuse public yellow+red brand colors.
