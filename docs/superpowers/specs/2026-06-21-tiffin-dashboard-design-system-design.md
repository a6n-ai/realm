# Tiffin Grab — Dashboard Design System Design

**Date:** 2026-06-21
**Status:** Approved (brainstorming, visual mockup signed off) — pending spec review
**Topic:** A shared, opinionated design-system layer (`apps/web/components/ds/`) that canonicalizes the recent redesign language into reusable composed components, adopted across every dashboard page so heading/breadcrumb/card/empty-state look identical everywhere.

## Goal

Stop every dashboard page from hand-rolling its own heading/cards. Provide a small set of composed components — `PageShell`, `PageHeader`, `Breadcrumbs`, `Card` (variants), `StatCard`, `SectionCard`, `ListRow`, `EmptyState` — built on the existing shadcn primitives and the redesign's visual language, then retrofit all dashboard pages to them. Pure presentation: **no behavior or data changes**.

## Context

- Next.js 16 App Router, React 19, Tailwind v4 (CSS-first `@theme` tokens in `apps/web/app/globals.css`), shadcn primitives in `apps/web/components/ui/` (card, breadcrumb, badge, button, typography, avatar, table, …).
- The recent WIP redesign added neutral **oklch** tokens (mono palette, radius scale) and ad-hoc utility classes — `.gradient-text`, `.card-glow`, `.hover-lift`, `.icon-pop`, `.ln` — used inconsistently. The redesigned pages (`meals`, `inquiries`) use an icon-chip + gradient-title header; older pages use `<h1 className="ln …">`. Breadcrumbs (`ui/breadcrumb.tsx`) exist but are unused on the dashboard.
- Visual direction **approved via mockup** (`.superpowers/sdd/design-mockup/index.html`, served at localhost:4567): neutral oklch palette, gradient titles, icon chip, ring/glow + hover-lift cards, stat cards, list rows, pill stage-badges (semantic ok/warn/bad accents), empty state, breadcrumb.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Visual direction | **Canonicalize the redesign** — gradient titles, icon chips, glow/hover-lift cards, mono oklch palette |
| Rollout | **All dashboard pages** now; marketing pages out of scope |
| Component home | `apps/web/components/ds/` (one file per component) |
| Class strategy | The redesign utility classes become the **internal implementation** of `ds/` components; pages import components, not raw classes |
| Breadcrumbs | **Auto-derived from the route** via a central label map, with a per-page override for dynamic segments |
| Reference | An admin-only **`/dashboard/design` showcase** page rendering every component + variant |
| Semantic accents | Add `ok`/`warn`/`bad` token trio for stage badges/deltas (light + dark); base palette stays neutral |

## Component inventory (`apps/web/components/ds/`)

Each is a thin, typed wrapper over shadcn primitives + the redesign classes. Interfaces (final prop names settled in the plan):

- **`PageShell`** — `({ children })`. Page container: consistent max-width + vertical rhythm. Wraps each dashboard page body. (Optionally lives in the `(dashboard)` layout so pages don't repeat it.)
- **`PageHeader`** — `({ icon: LucideIcon, title, subtitle?, breadcrumbs?, actions? })`. Icon chip + gradient-text title + optional subtitle, breadcrumbs above, right-aligned `actions` slot. Replaces every bespoke `<h1>`.
- **`Breadcrumbs`** — `({ items? })`. Wraps `ui/breadcrumb`. If `items` omitted, derives from `usePathname()` + a central `route-labels.ts` map (`/dashboard/inquiries` → "Inquiries"); dynamic segments (`[id]`) accept an override item (e.g. the inquiry's name).
- **`Card`** — `({ variant?: "glow" | "lift" | "flat", interactive?, className?, children })`. Formalizes `card-glow`/`hover-lift`. `glow` default. Re-exports/wraps `ui/card` sub-parts (`CardHeader`/`CardContent`) or supplies its own slots — match the existing `ui/card` API.
- **`StatCard`** — `({ label, value, icon?, delta?: { dir: "up"|"down", text } })`. Metric tile (overview/CRM stats): muted label + gradient value + colored delta.
- **`SectionCard`** — `({ title, subtitle?, action?, children })`. Titled content section (a `Card` with a header row + optional action button).
- **`ListRow`** — `({ avatar?, title, meta?, trailing?, href? })`. The repeated bordered flex row (people/leads lists): avatar/initials chip + title + meta + trailing slot (badge/buttons).
- **`EmptyState`** — `({ icon, message, action? })`. Centered icon tile + message + optional CTA. Replaces the duplicated empty blocks in `meals`/`inquiries`.
- **`StageBadge`** / **`Badge`** — pill badge with semantic variant (`neutral|ok|warn|bad`); the inquiry `stage-badge.tsx` folds into this.

## Tokens

- Keep the existing neutral oklch palette + radius scale in `globals.css` as the single source of truth.
- **Add** an `ok`/`warn`/`bad` semantic trio (light + dark) for badges/deltas (the only color in an otherwise mono system).
- The redesign utility classes (`gradient-text`, `card-glow`, `hover-lift`, `icon-pop`, `ln`) remain in `globals.css` but are referenced **only inside `ds/` components** — centralizing the look so a future restyle touches one layer. `prefers-reduced-motion` handling already present is preserved.

## Rollout (all dashboard pages — presentation only)

Retrofit each to `PageShell` + `PageHeader` (+ auto breadcrumbs) and replace bespoke cards/empty-states/rows with the `ds/` components, leaving all server data-loading, actions, and logic untouched:
`dashboard` (overview), `users` (+ `user-row`), `catalog` (+ `[resource]`), `dishes` (+ editor), `menus` (+ builder), `meals` (+ grid), `account`, `settings`, `settings/meal-slots`, `inquiries` (list + `[id]` + `[id]/order`). Each page's diff should be markup-only; existing tests must stay green.

## Testing

- **Render tests** per `ds/` component (props → expected structure/variant classes; `Breadcrumbs` route-derivation; `StatCard` delta direction; `EmptyState` CTA).
- The **`/dashboard/design` showcase** is the living visual reference (manual + screenshot check).
- Rollout verified by `pnpm typecheck` + `pnpm build` + the existing dashboard test suite staying green (no behavior change).

## Out of scope

- Marketing pages (different layout needs) — a later effort.
- CRM features (assignment, follow-up reminders, metrics, integrations) — the **next** initiative; this design system is its foundation.
- Dark-mode theming changes beyond adding the semantic trio (mode toggle already exists).

## Verification

`pnpm typecheck && DATABASE_URL=… pnpm test && pnpm build` all green; every dashboard page renders via `PageShell`/`PageHeader`; `/dashboard/design` shows all components; `rg "className=\"ln" apps/web/app/(dashboard)` returns nothing (no bespoke headings remain); breadcrumbs present on every dashboard page.
