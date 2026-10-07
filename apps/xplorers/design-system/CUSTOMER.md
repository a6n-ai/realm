# Xplorers customer design system

Source of truth for authenticated `/me` surfaces. Derived from the public
**Xplorers.Life** marketing language (`.xl` / `marketing.css`), adapted for
Operate mode (tasks: book, pay, support, account) rather than Persuade.

Admin `/dashboard` stays on `.crm-app` + Geist. Customer uses `.crm-app.customer-app`.

## Design DNA

1. **Playful navy + hot pink + sky actions** — navy for ink, pink for voice/focus, sky for primary CTAs, sunshine for success.
2. **Two fonts** — Bricolage Grotesque (display titles), DM Sans (UI body). Same as the public site.
3. **Soft geometry** — card radius ~18px, pill chips, press scale `0.97` on controls.
4. **Paper-light surfaces** — white/paper page, sky and blush soft fills; dark mode still supported but quieter.
5. **Quiet motion** — one soft page rise; Apple-style press feedback; respect `prefers-reduced-motion`.
6. **No marketing collage in app chrome** — no sticker boards, lopsided hero bands, or hard offset shadows on dense lists.

## Tokens (hex — keep in sync with `marketing.css`)

| Role | Token | Value |
|------|-------|-------|
| Ink | `--xl-navy-900` | `#16295a` |
| Brand blue | `--xl-navy-800` | `#1e4aa6` |
| Body | `--xl-navy-600` | `#2a3b66` |
| Muted | `--xl-navy-500` | `#4a5a82` |
| Pink focus | `--xl-pink-600` | `#e8177a` |
| Pink soft | `--xl-pink-100` | `#fde4f0` |
| Sky action | `--xl-sky-200` | `#bfe4fb` |
| Sky hover | `--xl-sky-300` | `#a6d8f8` |
| Sky border | `--xl-sky-400` | `#8fcdf3` |
| Sunshine | `--xl-sunshine` | `#ffd65a` |
| Paper | `--xl-paper` | `#f7f9fc` |
| Line | `--xl-line-300` | `#e1e7f2` |

Mapped into shadcn semantic vars on `.customer-app` (see `app/customer.css`).

## Type

| Role | Face | Weight | Use |
|------|------|--------|-----|
| Display | Bricolage Grotesque | 700–800 | Page titles (`h1`) |
| Body | DM Sans | 400–700 | Everything else |
| Eyebrow (rare) | DM Sans | 700 | Uppercase pink kickers only when a section needs a category label — prefer plain titles |

Tracking: headings `-0.03em`. Body `15–16px`, leading `1.55–1.6`.

## Components

| Surface | Pattern |
|---------|---------|
| Shell | CrmShell + glass bottom nav; logo brand (public PNG) |
| Page | `PageShell` + `PageHeader` (display title, soft icon tile) |
| Sections | `SectionCard` with soft border, 18px radius, no nested cards |
| Primary CTA | Sky fill, navy text, sky border (marketing `.xl-btn`) |
| Secondary CTA | White + line border |
| Success / celebrate | Sunshine fill |
| Lists | Divided rows inside one card; status as pills |
| Focus | Pink 2px ring, 2px offset |
| Tabs | Underline (`line`) TabsList; active = navy weight |

## Motion

- Page content: short opacity + 10px rise on first paint (disabled when reduced motion).
- Buttons / nav tabs: `active: scale(0.97)`, ~120ms ease-out.
- No route transition overlays; no sticker “press on” animations in `/me`.

## Anti-patterns

- Geist on customer chrome (admin only).
- Navy-filled primary buttons that look like admin CRM.
- Hard `4px 4px 0` sticker shadows on account lists.
- Purple gradients, glass-for-decoration, emoji as icons.
- Copying marketing hero collage into Overview.

## File map

| File | Role |
|------|------|
| `app/customer.css` | Token + shell overrides for `.customer-app` |
| `app/(customer)/layout.tsx` | Fonts + `customer-app` class |
| `components/customer/customer-brand.tsx` | Public logo in shell |
| `design-system/CUSTOMER.md` | This document |
