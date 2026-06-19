# Tiffin Grab — Subsystem F Design Spec

**Date:** 2026-06-19
**Scope:** Subsystem F — public marketing website wrapping the subscription funnel.
**Builds on:** Slice 1 (A/B/C) and subsystem D (catalog editor, inquiries CRM).
**Deferred:** Subsystem E (weekly-menu engine) — see `PROJECT.md`.

---

## 1. Goals & non-goals

**Goals**
- A multi-page public marketing site that funnels visitors into the existing `/subscribe`
  wizard and gives the brand a real homepage (replacing the Next.js starter `app/page.tsx`).
- Menu and pricing pages render **live catalog data** (subsystem D), so admin catalog edits
  surface on the site automatically.
- A public **Contact** form that creates a `website`-sourced inquiry in the sales pipeline
  (subsystem D), waitlist-aware via the delivery-zone matcher.

**Non-goals (this slice)**
- Visual/UI revamp — reuse the existing shadcn/Geist theme tokens; a dedicated redesign is a
  later slice.
- Real photography/illustration, blog/CMS, i18n.
- Rate-limiting / captcha on the contact form (basic honeypot only; noted as a risk).
- Weekly-menu content (subsystem E).

---

## 2. Architecture & routing

A new `(marketing)` App Router route group with its own layout (shared public header +
footer), separate from the `(public)` funnel group, `(auth)`, and `(dashboard)`.

| Route | Page | Source |
|---|---|---|
| `/` | Landing | static copy + CTAs |
| `/how-it-works` | 4-step plan → checkout → activation story | static copy |
| `/menu` | Meal-size showcase grouped by tier, with macros | **live catalog** |
| `/pricing` | Plans, add-ons, frequencies, durations + discount % | **live catalog** |
| `/about` | Brand story | static copy |
| `/faq` | Common questions | static copy |
| `/contact` | Inquiry form (waitlist-aware) | server action → subsystem D |

- **Header nav:** logo → `/`; links to the pages above; **"Start subscription"** CTA →
  `/subscribe`; **"Sign in"** → `/login`.
- **Footer:** zones served (static list), nav links, copyright.
- **Theme:** existing shadcn/Geist tokens (`components/ui/*`); no new design system.
- The `(public)` funnel (`/subscribe`, `/checkout`, `/activate/[deploymentId]`) is unchanged;
  the header CTA links into it.

### Files
```
apps/web/app/
├─ page.tsx                         # REPLACE starter → Landing (or move under (marketing))
├─ (marketing)/
│  ├─ layout.tsx                    # SiteHeader + SiteFooter wrapper
│  ├─ how-it-works/page.tsx
│  ├─ menu/page.tsx                 # live catalog (server)
│  ├─ pricing/page.tsx              # live catalog (server)
│  ├─ about/page.tsx
│  ├─ faq/page.tsx
│  └─ contact/
│     ├─ page.tsx
│     ├─ actions.ts                 # createWebsiteInquiry
│     └─ contact-form.tsx           # client
└─ components/marketing/
   ├─ site-header.tsx
   ├─ site-footer.tsx
   ├─ hero.tsx
   ├─ section.tsx
   └─ cards.tsx                     # feature / step / price / meal cards
```
Note: in the Next.js App Router, route groups do not change the URL, so the landing page is
served at `/`. The landing page lives either at `app/page.tsx` wrapped by a shared layout, or
is moved into `(marketing)` with a root `page.tsx` re-export — implementation detail for the
plan; either way `/` renders the landing within the marketing header/footer.

---

## 3. Live catalog pages

`/menu` and `/pricing` are **server components** calling the existing
`loadCatalogSnapshot()` (`apps/web/lib/catalog/load.ts`), which already filters `active=true`.
No new data layer.

- **`/menu`** — meal sizes grouped by `tier` (Budget / Medium / Premium); each card shows
  name, diet, components, kcal range, protein/carbs/fat, base price.
- **`/pricing`** — plans (nutrition baselines), add-ons (+price/week), delivery frequencies
  (with courier discount), duration packages (with loyalty discount %). Read-only.
- Both end with a **"Start subscription"** CTA → `/subscribe`.

---

## 4. Contact → inquiry (waitlist-aware)

Public server action `createWebsiteInquiry(input)` in `app/(marketing)/contact/actions.ts`:

- **Input:** `fullName` (req), `phone` (req), `email?`, `postalCode?`, `message?`, plus a
  hidden honeypot field.
- **Validation:** reject if the honeypot is filled (silent success to the bot, no write);
  validate phone via `isValidCaPhone` (reuse `lib/services/users-contact.ts`) → `ValidationError`.
- **Zone check:** if `postalCode` provided, run `matchZone(postalCode, snapshot.zones)`
  (`lib/catalog/postal.ts`); `waitlisted = !matched`.
- **Persist:** `inquiriesService.create({ fullName, phone, email, source: "website",
  notes: message, prefs: { servedZone: matched?.name ?? null, waitlisted } })`. Anonymous —
  `createdBy`/`assignedTo` null; the service writes the `created` activity; inquiry enters the
  D pipeline as `new`.
- **Returns:** `{ ok: true, waitlisted }`. The client form shows a served confirmation
  ("we'll be in touch") vs a waitlist message ("we don't serve your area yet — you're on the
  waitlist").

`inquirySource` already includes `website`; no schema change. `inquiries.prefs` is the
existing jsonb column.

---

## 5. Components & content

- `components/marketing/`: `site-header.tsx` (client — active-link highlighting via
  `usePathname`, mobile menu using the existing `sheet` component), `site-footer.tsx`,
  `hero.tsx`, `section.tsx`, and `cards.tsx` presentational pieces. Reuse `components/ui/*`
  (button, card, badge, input, label, etc.).
- Static copy (`/about`, `/faq`, hero, value props, how-it-works steps) as plain JSX — sensible
  real-ish marketing copy, editable later.
- Per-page `metadata` (title + description) for SEO; keep the existing root `metadata` brand.
- Remove the Next.js starter content and `next.svg`/`vercel.svg` usage from the homepage.

---

## 6. Testing

- **Vitest** (`createWebsiteInquiry`):
  - creates an inquiry with `source="website"` and a `created` activity;
  - sets `prefs.waitlisted=true` for an unserved postal, `false` for a served one;
  - rejects a malformed phone with `ValidationError`;
  - a honeypot-filled submission writes nothing and returns ok (bot-silent).
- Catalog pages (`/menu`, `/pricing`) are covered by `pnpm build` (server components) plus the
  existing catalog-loader tests.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Public contact form spam | Honeypot field this slice; rate-limiting/captcha noted as follow-up |
| Marketing copy drift vs real offering | Menu/pricing are live from catalog; only narrative copy is static |
| Route-group/layout wiring on Next 16 | Read `node_modules/next/dist/docs/`; verify `/` renders within the marketing layout |
| Theme reuse looks "appy" not "marketing" | Accepted — dedicated UI revamp is a deferred slice |

---

## 8. Out of scope / follow-up (tracked in PROJECT.md)

- **E** Weekly-menu engine.
- Marketing UI/visual revamp (custom design system, photography).
- Contact-form rate-limiting/captcha, email/SMS notification of new website inquiries.
- Blog/CMS, i18n, analytics.
