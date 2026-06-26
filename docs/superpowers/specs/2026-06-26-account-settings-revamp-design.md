# Account Settings Revamp + Shared Customer Dashboard

Date: 2026-06-26
Status: Approved (design)

## Problem

`/dashboard/account` is a plain, role-blind stack of shadcn forms inside three
basic tabs (Profile / Contact / Security). Every role — `admin`, `member`
(staff), `user` (customer) — sees identical fields, including the staff-only
PIN. A customer-facing dashboard is a known upcoming goal: customers (role
`user`) will manage their own subscription and menu picks. The account surface
must become reusable across staff and customer dashboards, gain the fields a
customer profile needs (notably a saved delivery address, which today exists
only per-order), and look intentional rather than templated.

## Goals

- Revamp the account settings UI to a polished, role-aware, section-based layout.
- Add customer profile fields: delivery address, dietary/allergens, delivery
  notes, notification preferences.
- Extract account UI into a shared, role-driven component reusable by both the
  staff dashboard and a new bare-minimum customer dashboard landing.
- Hold a high quality bar: accessibility, Vercel React/Next best practices,
  design polish, no regressions to existing tests.

## Non-goals

- Multiple saved addresses per user (single address on profile; upgrade later).
- Moving account UI into `@tiffin/commons-next` (both dashboards live in
  `apps/web`; keep it in-app).
- PIN for customers (PIN is the staff idle-lock feature only).
- Full customer subscription/menu dashboard (only a bare landing this pass).
- Email/SMS sending wiring (notification prefs are stored only; delivery is a
  separate future system).

## Decisions (locked)

- **Address model:** single address on the `users` table.
- **New fields:** delivery address, dietary prefs/allergens, delivery notes,
  notification prefs.
- **Shared component home:** `apps/web` shared component dir
  (`components/account/`), not a commons package.
- **Scope:** build staff + customer account shells now, plus a bare-minimum
  customer `/dashboard` landing reachable after login.

## Schema changes

One migration via Drizzle `db:generate` (next_id preamble hand-maintained in
the baseline per project convention). Add to `users`:

| Column | Type | Notes |
|---|---|---|
| `address_line` | text | reuses order address shape |
| `address_unit` | text | apt/unit, optional |
| `city` | text | |
| `postal_code` | text | |
| `province` | text | |
| `dietary_notes` | text | free-form |
| `allergens` | text | comma-separated; typed multiselect in UI |
| `delivery_notes` | text | gate code, drop-off, landmark |
| `notify_email` | boolean, default true | |
| `notify_sms` | boolean, default false | |

All nullable except the booleans. No backfill needed.

`usersService` gains `updateAddress(userId, input)` and
`updatePreferences(userId, input)`, each subclass methods calling
`super.update` per the services-extend-commons convention. Validation at the
trust boundary via zod in the section schemas.

## Shared UI: `components/account/`

A single `AccountSettings` shell driven by a **role → sections** config map.
Each section is a self-contained card: its own form, zod schema, and server
action. Sections compose; the shell renders only those allowed for the viewer's
role.

Role → section matrix:

| Section | admin | member | user |
|---|---|---|---|
| Profile (avatar, name) | ✓ | ✓ | ✓ |
| Contact (phone, email + verify) | ✓ | ✓ | ✓ |
| Delivery address | — | — | ✓ |
| Dietary / allergens | — | — | ✓ |
| Delivery notes | — | — | ✓ |
| Notifications | — | — | ✓ |
| Security — PIN (staff lock) | ✓ | ✓ | — |
| Security — password + sign-out | ✓ | ✓ | ✓ |

Each unit answers: what it does (one section of account state), how you use it
(drop into the shell's section list), what it depends on (its own server
action + the user fields it edits). Sections are independently understandable
and testable.

Design polish (make-interfaces-feel-better + impeccable): section cards over
raw tabs, optical spacing, tabular-num for any numerics, per-card save state,
optimistic toasts. No gradient/clip/animation on text (per user preference).

## Routes

- **Staff** `/dashboard/account` → shared `AccountSettings` with staff sections.
- **Customer** `/dashboard` gains a `user`-role bare landing (welcome + entry
  points to account and subscription). The existing sidebar already filters nav
  by role; confirm `user` sees only Account (+ landing). Same shared component
  serves customer account sections.

The dashboard layout already admits any authenticated user and self-guards
staff pages; no new route group required.

## Quality bar

- Server components for data fetching; client components only for interactive
  forms (vercel-react-best-practices).
- Keep all existing account tests green; add tests for new sections and for
  role-gated section visibility.
- Accessibility: labelled fields, keyboard-reachable, error announcements.

## Execution: ultracode workflows

Four sequential workflows; user reviews between each.

1. **Understand** — parallel readers map the account surface, `usersService` +
   commons base service, design tokens / `components/ds`, shadcn inventory, and
   role gating into structured spec inputs.
2. **Design** — judge panel scores three layouts (tabbed / single-scroll
   sectioned / sub-nav sidebar) against the role-aware multi-audience need;
   pick a winner before code.
3. **Implement** — pipeline: schema + migration + service → shared section
   components → route wiring (staff account + customer landing), worktree
   isolation where parallel file writes would conflict.
4. **Review** — dimensions (a11y, Vercel-React perf, design polish,
   correctness, role-gating safety) → adversarial verify each finding → apply.

## Risks

- Migration on a live seeded DB (live-db test harness): additive nullable
  columns only, low risk; never drop shared fixtures.
- Role-gating bug could leak staff PIN to customers or hide customer fields —
  covered by Review dimension + tests.
