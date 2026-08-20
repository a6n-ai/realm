---
name: Tiffin Grab
description: A brutalist-editorial identity for the public and customer surfaces — "Tiffin Brutal"
colors:
  brand-orange: "#F06B1A"
  brand-orange-foreground: "#FFFFFF"
  brand-orange-hover: "#D85F14"
  warm-cream: "#FBF4E7"
  warm-ink: "#241F1B"
  card-white: "#FFFFFF"
  warm-wash: "#F1EEE5"
  muted-ink: "#6E6558"
  hairline: "#E3DFD1"
  badge-forest: "#1D5C32"
  destructive: "oklch(0.577 0.245 27.325)"
typography:
  display:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "clamp(48px, 11vw, 150px)"
    fontWeight: 700
    lineHeight: 0.92
    letterSpacing: "-0.045em"
  heading:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "clamp(28px, 5vw, 52px)"
    fontWeight: 700
    letterSpacing: "-1.5px"
  body:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  eyebrow:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.25em"
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.brand-orange}"
    textColor: "{colors.brand-orange-foreground}"
    rounded: "{rounded.full}"
    padding: "0 32px"
    height: "56px"
  button-primary-hover:
    backgroundColor: "{colors.brand-orange-hover}"
  card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.xl}"
  input:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.xl}"
---

<!-- This REPLACES the prior "undesigned shadcn baseline" placeholder. That doc
     recorded a stock shadcn install and explicitly said not to copy Puchkaman's
     neobrutalist system into this app. The operator has since approved and shipped
     a brutalist identity — "Tiffin Brutal" — scoped to tiffin-grab's own public,
     auth, and customer-facing surfaces (docs/design/prototype-generation.md sets
     the repo-wide convention: admin stays stock shadcn, public+auth+customer goes
     neo-brutalist per client). This is not Puchkaman's system reused; it is a
     distinct identity for this product, built from a Claude Design poster
     (`TiffinGrab v3 Poster.dc.html`) and screenshot-verified against it
     page-by-page. Admin/dashboard surfaces are out of scope for this file and
     remain the prior stock-shadcn language. -->

# Design System: Tiffin Grab

## Overview

**Creative North Star: "The Dabba Ticket"**

Every screen borrows its logic from two physical objects a subscriber already
trusts: the stainless tiffin box and the paper receipt that comes with it.
Headings are stamped, not printed — bold, oversized, occasionally stroked-outline
or italic, like something cut from a signboard. Content blocks behave like
ticket stock: solid hairline borders, dashed tear-lines between sections, and
receipt-style summary cards that sit slightly off their background with a hard
offset shadow, as if punched down onto the page. Buttons and navigation are
pill-shaped and orange, the one saturated color in an otherwise cream-and-ink
field. Nothing is soft-shadowed or gradient-filled except the offset-shadow
receipt cards, which are the system's one deliberate flourish.

The identity is confident because it repeats without exception: the same
uppercase tracked eyebrow label ("01 — Pick a baseline"), the same
`border-[1.5px] border-foreground` hairline, the same dashed divider, the same
pill button, from the marketing hero through checkout to the post-subscribe
activation screen. It was built once, against a single reference (the Claude
Design poster), and then applied everywhere rather than reinvented per page.

**Key Characteristics:**
- Bold, often stroke-outlined or italic display headings (Poppins 700)
- Rounded-full pills for every button and the primary nav
- `1.5px` solid hairline borders on cards, `1.5px` dashed dividers inside them
- One offset "punch shadow" (`6px 6px 0 var(--primary)`) reserved for
  receipt/invoice/summary cards — never used decoratively elsewhere
- Single saturated accent (brand orange); forest green appears only as a
  status/confirmation color, never decoratively
- Flat by default — no ambient drop shadows, no gradients except the hero's
  photo-to-background fade and the marquee band

## Colors

Warm cream and ink with one saturated accent; every neutral in the system
carries the same warm bias, never a cool grey.

### Primary
- **Brand Orange** (`#F06B1A`, dark mode `#FF9843`): the only saturated accent.
  Primary buttons, active nav pill, focus states, headline emphasis (the
  italic "DELIVERED." line), pricing-formula operators, and the offset punch
  shadow on receipt cards.

### Neutral
- **Warm Cream** (`#FBF4E7`, dark mode `#14201A`): page background.
- **Warm Ink** (`#241F1B`, dark mode `#F3EFE4`): primary text and hairline
  borders (borders reuse the foreground color at `1.5px`, not a separate
  border token — that's deliberate, it's what makes the hairline read as
  "drawn," not "default shadcn gray").
- **Card White** (`#FFFFFF`, dark mode `#1B2921`): card and receipt surfaces.
- **Warm Wash** (`#F1EEE5`, dark mode `#223229`): muted/secondary surfaces.
- **Muted Ink** (`#6E6558`, dark mode `#A9AFA3`): supporting text, eyebrow
  labels' non-color state, dates, kcal/macro lines.
- **Hairline** (`#E3DFD1`): input/form borders where the full-weight
  foreground border would be too heavy (e.g. shared `@realm/ui` inputs not
  yet reskinned to the `1.5px` foreground treatment — see Components).

### Status
- **Badge Forest** (`#1D5C32`): confirmation/success callouts only — the
  "20+ tiffins unlocks the best rate" style copy, waitlist confirmation,
  zone-served banners. Never decorative.
- **Destructive** (`oklch(0.577 0.245 27.325)`): unwarmed, inherited from
  shadcn defaults; form/validation errors only.

### Named Rules
**The One Punch Rule.** The `6px 6px 0 var(--primary)` offset shadow exists
on receipt/invoice/summary cards and nowhere else. If a new card wants
"emphasis," reach for the hairline border or a dashed divider first — the
punch shadow is reserved, not a general elevation tool.

**The Warm Neutral Rule** (carried forward from the prior baseline). Every
neutral carries a warm cast; a cool grey reads as foreign against food
photography and thali imagery.

## Typography

**Display Font:** Poppins (with `system-ui`, sans-serif fallback)
**Body Font:** Poppins — one family throughout, weighted 400–700
**Label Font:** Poppins, uppercase, tracked `0.25em` for eyebrows; Geist Mono
reserved for tabular numerals (prices, step counters, invoice line items)

**Character:** A single confident grotesque doing all the work — headlines
lean on weight and scale rather than a second display face. Large text goes
stroke-outline (`-webkit-text-stroke`) or italic for emphasis instead of a
color or weight change alone, which is what gives the hero and pricing
formula their poster-like, stamped quality.

### Hierarchy
- **Display** (700, `clamp(48px,11vw,150px)`, line-height `0.92`, tracking
  `-0.045em`): the hero headline only, one per page.
- **Heading** (700, `clamp(28px,5vw,52px)`, tracking `-1.5px`): section
  titles ("Three ways to eat.", "No packages. Just math.").
- **Body** (400, 1rem, line-height 1.5): running copy, in warm ink or muted
  ink.
- **Eyebrow** (600, 12px, tracking `0.25em`, uppercase, brand orange): the
  numbered section label pattern ("01 — Pick a baseline") that opens every
  major content section.
- **Tabular/Mono**: prices, step numerals, invoice amounts — always
  `font-variant-numeric: tabular-nums` so columns align.
- Below Body, everything (captions, credit lines, day/date labels, chip
  labels, coupon-tag pills) uses Tailwind's stock `text-xs` (12px) or
  `text-sm` (14px) — no arbitrary in-between pixel value. `text-lg` (18px)
  covers the one supporting-CTA subtitle size (hero "Build my tiffin"
  paragraph). No custom `caption`/`micro` role was needed: every one-off
  size the detector flagged was within 1-2px of a stock step and snapped
  there without a visible change.

### Named Rules
**The Stroke-Not-Color Rule.** Large display type gets emphasis from a
stroke outline or italic, not from a second accent color layered onto text.
Color is reserved for the one line that should read as the payoff (e.g. the
italic "DELIVERED." in brand orange).

## Layout

Full-bleed marketing sections (`padding: 100-110px clamp(16px,4vw,44px)`)
stacked vertically, no sidebar on public surfaces. The subscribe wizard and
checkout use a centered `max-w-880px` / `max-w-1000px` column under a sticky
translucent header and (for the wizard) a sticky bottom action bar. Weekly
menu content breaks the vertical stack with a horizontal, non-snapping
scroll row of fixed-width day cards — the one place the layout deliberately
goes sideways. Density is generous on marketing pages (large type, wide
gutters) and tightens on task surfaces (wizard steps, checkout form) where
scanability matters more than spectacle.

## Elevation & Depth

**Flat by default.** Depth comes from hairline borders and dashed dividers,
not ambient shadow. The single exception is the offset "punch shadow" on
receipt/invoice/summary cards (see Named Rules above) — a hard-edged,
non-blurred `6px 6px 0` shadow that reads as a physical object sitting on
the page, not a soft elevation cue. Buttons get a soft glow shadow
(`0 12px 30px -6px var(--color-primary)`) on primary CTAs only, to keep them
feeling tappable against a flat field.

### Shadow Vocabulary
- **Punch** (`box-shadow: 6px 6px 0 var(--color-primary)`): receipt/invoice/
  order-summary cards only.
- **CTA glow** (`box-shadow: 0 12px 30px -6px var(--color-primary)`):
  primary pill buttons, sparingly — not every button gets it.

## Shapes

Two registers, no middle ground. Buttons, nav pills, and step-selector chips
are fully rounded (`rounded-full`). Cards, receipts, and photo/placeholder
blocks use a soft large radius (`rounded-xl`/`rounded-2xl`, ~14–18px) with a
`1.5px` solid border in the foreground color rather than the lighter
`--border` token — that heavier, ink-colored border is what separates this
system from a stock shadcn card. Dashed `1.5px` dividers (never solid)
separate sub-sections inside a card (invoice line items, meal-tier chip
rows).

## Components

### Buttons
- **Shape:** `rounded-full`, no exceptions on public/customer surfaces.
- **Primary:** brand orange background, white/dark foreground per theme,
  `h-52` to `h-60` depending on prominence, CTA glow shadow on hero/pricing
  CTAs.
- **Secondary/Outline:** transparent background, `1.5px` foreground border,
  same pill radius.
- **Press state:** shared `@realm/ui` `Button` already applies
  `active:translate-y-px` — respond on press, not just release.

### Cards / Receipt cards
- **Corner style:** `rounded-2xl` (~18px).
- **Border:** `1.5px solid` foreground color, not the lighter `--border`
  token — this is what makes a card read as "drawn" rather than "default."
- **Receipt variant:** adds the punch shadow, a dashed divider under a
  "🧾"-prefixed header row, and a bold tabular-nums `TOTAL` line.

### Inputs / Fields
- Shared `@realm/ui` `Input` still ships its stock `rounded-lg` and
  `--border` token by default. Reskinned call sites (checkout contact form,
  coupon/coins boxes) pass `className="h-13 rounded-2xl border-[1.5px]
  border-foreground"` at the call site rather than editing the shared
  package — see Do's and Don'ts. Not every input on every page has been
  reskinned yet; treat an un-reskinned input as a known gap, not a pattern
  to copy.

### Navigation
- Centered pill nav (`absolute left-1/2 -translate-x-1/2` inside a
  `relative` header), translucent `backdrop-blur` background, active link
  gets a muted-wash pill behind it. Logo pinned left, theme toggle +
  session-aware account link pinned right. Mobile collapses to a Sheet
  drawer using the same link set.

### Weekly menu ticket cards (signature component)
The one place the system explicitly borrows a real-world object: a
horizontal-scroll row of `250px`-wide day cards, each with a day+date header
over a `1.5px` dashed divider, a diagonal-stripe photo-placeholder block
(`repeating-linear-gradient` at `-45deg`) labeled `photo: {dish}` when no
real image exists, and a bulleted dish list below. This is the pattern to
extend if a future surface needs to show "a day's worth of something" —
don't reinvent a different card shape for that job.

## Do's and Don'ts

### Do:
- **Do** use the `1.5px solid` foreground-color border on every card;
  never the lighter `--border` token on a brutalist-system card.
- **Do** reserve the offset punch shadow for receipt/invoice/summary
  content — it means "this is a real total," not "this card is important."
- **Do** override shared `@realm/ui` primitives via the `className` prop at
  the call site (e.g. `border-[1.5px] border-foreground rounded-2xl` on
  `Input`) rather than editing the package — the package stays generic for
  other apps in the monorepo; this app's identity lives in its own call
  sites and in `app/globals.css`'s `--radius`/color tokens.
- **Do** keep the eyebrow-label pattern (`NN — Section name`, uppercase,
  tracked, brand orange) as the one way sections introduce themselves.
- **Do** keep both light and dark themes complete — dark mode has been
  screenshot-verified: the stroke-outline hero text, photo gradient, and
  marquee band all hold up.

### Don't:
- **Don't** add a second saturated accent color. Badge Forest is a status
  color, not a design accent — using it decoratively breaks the "orange
  means action" rule.
- **Don't** treat this as Puchkaman's neobrutalist system reused. It's a
  distinct identity built for this product from its own poster reference;
  don't cross-pollinate components between the two apps' design systems.
- **Don't** apply this brutalist language to admin/dashboard surfaces —
  those remain stock shadcn per repo convention.
- **Don't** use a soft/blurred shadow anywhere in this system. Depth is
  hairlines and one hard-edged punch shadow, never a blur.
- **Don't** introduce a solid divider inside a card where the poster's
  pattern uses dashed — dashed means "tear here," solid means "this is a
  hard edge/boundary" (row lists, section borders).
