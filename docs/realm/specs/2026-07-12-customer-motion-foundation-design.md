# Customer Design/Motion Foundation — Design (Slice 0)

**Date:** 2026-07-12
**App:** `apps/tiffin-grab`
**Status:** Approved, ready for implementation plan

## Context

Part of a larger customer-experience revamp program (make the customer app feel
like Uber/DoorDash/Zomato/Swiggy). The program is decomposed into
independently-shippable slices:

- **0 — Design/motion foundation** ← this spec
- 1 — Home + catalog browse (meal sizes, dishes, this-week menu, wallet peek, empty-state fixes)
- 2 — Weekly meal picker + cutoff countdown banner
- 3 — Wallet (coins + money + full logs)
- 4 — Deliveries hub + "no orders"/waitlisted fix
- 5 — Contact + subscribe (country-code picker in checkout/admin, logged-in past subscriptions)

Slice 0 is the shared motion plumbing slices 1–5 consume. It ships no new page;
it is proven by wiring into a few existing customer surfaces so it is
verifiable rather than a dead abstraction.

### Ground truth (from codebase map, 2026-07-12)

- App: Next.js 16.2.9, React 19.2.4, Tailwind v4, single `app/globals.css`.
- No animation JS lib installed today. Only `tw-animate-css@^1.4.0` (CSS keyframes).
- Customer shell already exists: `components/customer/customer-sidebar.tsx`,
  `customer-bottom-nav.tsx`, `customer-search.tsx`, and home sections under
  `components/customer/home/` (incl. `wallet-section.tsx`).
- `packages/ui` holds shadcn-style primitives incl. `phone-input.tsx`,
  `skeleton.tsx`. Foundation for THIS slice stays in `apps/tiffin-grab` per repo
  rule (product/client-specific code stays in the app until a second client
  proves it shared — only one client, `tiffin-grab`, exists).

## Decisions (locked)

- **Motion engine:** add `motion` (framer-motion) for UI micro-interactions
  (tap, stagger, layout, spring, count-up) + `lottie-react` for illustrative
  animations, using its **SVG renderer** (explicit user requirement — SVG
  animation from LottieFiles).
- **Route transitions:** native browser **View Transitions API** (no JS lib),
  progressive-enhancement, reduced-motion aware.
- **Location:** everything in `apps/tiffin-grab`. No schema change. No new
  workspace package. `motion` and `lottie-react` are node deps (not workspace
  packages) so `next.config.ts` `transpilePackages` is unchanged.
- **Design bar:** Uber/DoorDash-level ("full send").

## Deliverables

### 1. Dependencies

Add to `apps/tiffin-grab/package.json`:

- `motion` (import from `motion/react`)
- `lottie-react`

Run `pnpm install` in the worktree.

### 2. Lottie primitive — `components/motion/lottie.tsx`

- `"use client"` (hard requirement — client symbol; verify by eye per AGENTS.md).
- Dynamic-import `lottie-react` (`next/dynamic`, `ssr: false`) so it is SSR-safe
  and its ~250kb loads lazily only when an animation mounts.
- `renderer: "svg"` via `rendererSettings`/`Lottie` props (SVG, per requirement).
- Props:
  - `src`: path under `/lottie/...` (string) OR imported JSON module
  - `mode`: `"loop" | "once" | "hover" | "inView"` (default `"inView"`)
  - `className`, `speed?`, `loop?` (override), `label?` (a11y)
- **Reduced-motion:** when `prefers-reduced-motion: reduce`, render the static
  first frame (`autoplay=false` + stop at frame 0); never animate.
- `inView` mode: play once/looping when scrolled into view via
  IntersectionObserver.
- a11y: `role="img"` + `aria-label={label}` when `label` given, else
  `aria-hidden`.

### 3. Lottie assets

- Files: `public/lottie/*.json`.
- Manifest: `lib/lottie/manifest.ts` — `Record<name, { path, license, attribution }>`.
- Seed set (only these; more added per-slice, not upfront):
  `empty-box`, `delivery-scooter`, `success-check`, `coin-burst`, `loading`,
  `celebrate`.
- **License gate (blocking):** each asset is sourced from the LottieFiles free
  set (https://lottiefiles.com/free-animations) and MUST be confirmed
  free-for-commercial-use; its attribution/author + source URL is recorded in
  the manifest entry. Any asset that cannot be confirmed free-for-commercial is
  not used.

### 4. Motion tokens

- Extend `app/globals.css` `@theme`:
  - `--duration-fast: 150ms`, `--duration-base: 250ms`, `--duration-slow: 400ms`
  - `--ease-soft` (cubic-bezier ease-out), `--ease-spring` (overshoot curve)
  - global `@media (prefers-reduced-motion: reduce)` guard neutralizing
    transitions/animations.
- `lib/motion/tokens.ts`: export `motion` transition/spring presets
  (`springSoft`, `easeBase`, stagger step) whose feel matches the CSS vars, so
  `<motion.*>` components and CSS stay consistent.

### 5. Motion primitives — `components/motion/`

All `"use client"`, all reduced-motion aware.

- `<Reveal>` + `<Reveal.Group>` — in-view fade/slide-up; group staggers children.
- `<AnimatedNumber value format />` — spring count-up (used by wallet balance /
  coins / money). `format` maps number → display string. Reduced-motion → static
  value, no tween.
- `<Pressable>` — thin wrapper applying `whileTap={{ scale }}` to tappable
  cards/buttons.
- `<EmptyState>` — composes `<Lottie>` + title + body + optional CTA. Consumed by
  empty deliveries/wallet states.

### 6. View Transitions

- `<TransitionLink>` wrapping `next/link`: on navigate, calls
  `document.startViewTransition(...)` when supported; falls back to normal
  navigation otherwise. Skips `startViewTransition` under reduced-motion.
- Base `::view-transition-old(root)/new(root)` cross-fade CSS in `globals.css`.
- Wire `<TransitionLink>` into existing `CustomerSidebar` and
  `CustomerBottomNav` nav items. Shared-element `view-transition-name`s are added
  per-slice later, not here.
- **Framework gate:** before enabling, read `node_modules/next/dist/docs` for
  Next 16's `viewTransition` config flag / any required `next.config.ts` setting
  (AGENTS.md: read the docs before framework code).

### 7. Proof-of-life (verification target)

Apply the foundation to existing surfaces only — no page rebuilds (those are
slices 1–5):

- Bottom-nav / sidebar items get `<TransitionLink>` + press feedback.
- Wallet balance in `components/customer/home/wallet-section.tsx` uses
  `<AnimatedNumber>`.
- The wallet (or deliveries) empty state renders via `<EmptyState>` with a seed
  Lottie.

This proves every primitive against a real consumer before slices 1–5 depend on
them.

## Non-goals (deliberately skipped; add when a slice needs it)

- Graduating any of this to a `@realm/*` package (single client).
- Gesture/drag system (add in the slice with swipe, e.g. deliveries).
- Shared-element route choreography beyond default cross-fade.
- A Lottie library beyond the seed 6.
- Rebuilding any customer page (slices 1–5).

## Testing / verify contract

- One vitest (`components/motion/__tests__/`) asserting each primitive's
  reduced-motion branch renders static output (no animated transform / static
  number / stopped lottie). Mock `matchMedia` for `prefers-reduced-motion`.
- `pnpm turbo typecheck && pnpm turbo test` (repo verify gate).
- Eyeball checks (tsc can't catch): every motion primitive has `"use client"`;
  no client symbol demoted from a named export.

## Risks

- `lottie-react` bundle weight → mitigated by dynamic `ssr:false` import so it
  loads only when an animation mounts.
- View Transitions browser support varies → progressive enhancement + fallback
  to normal nav, so unsupported browsers are unaffected.
- LottieFiles licensing → blocking license gate in §3; no unconfirmed asset ships.
