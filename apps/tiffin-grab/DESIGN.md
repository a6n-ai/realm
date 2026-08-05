---
name: Tiffin Grab
description: An undesigned shadcn baseline with a warm saffron accent, awaiting a real identity
colors:
  saffron: "oklch(0.66 0.16 60)"
  saffron-on: "oklch(0.985 0.01 60)"
  warm-white: "oklch(0.995 0.002 60)"
  warm-ink: "oklch(0.16 0.006 60)"
  warm-wash: "oklch(0.97 0.004 60)"
  warm-panel: "oklch(0.975 0.006 60)"
  hairline: "oklch(0.92 0.004 60)"
  muted-ink: "oklch(0.55 0.012 60)"
  destructive: "oklch(0.577 0.245 27.325)"
typography:
  display:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
components:
  button-primary:
    backgroundColor: "{colors.saffron}"
    textColor: "{colors.saffron-on}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  card:
    backgroundColor: "{colors.warm-white}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.lg}"
  input:
    backgroundColor: "{colors.warm-white}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.md}"
---

<!-- BASELINE: these tokens are what the code currently ships, not a chosen identity.
     The operator has confirmed this is a placeholder. A future pass is free to REPLACE
     this world rather than preserve it; nothing below is a brand commitment except
     where explicitly marked. -->

# Design System: Tiffin Grab

## Overview

**Creative North Star (directional, not yet built): "The Weekly Planner"**

What exists today is a stock shadcn/Tailwind v4 installation with one deliberate
change: every neutral has been warmed to hue 60, and the accent is a saffron orange.
It is competent and consistent, and it is not an identity. The operator has confirmed
it as a placeholder, so this file records the baseline honestly rather than dressing
it up as a considered system.

The direction to grow toward is **The Weekly Planner**: calm, gridded and legible,
because the product is a schedule someone has to trust. A subscriber configures a plan
once and then lives inside a calendar for weeks — picking meals, skipping days, booking
a vacation. That makes clarity and predictability the real brief, and it means the
identity, when it arrives, should come from the calendar and the plan builder rather
than from a marketing hero.

One thing is worth preserving through any replacement: the warm neutral bias. Every
grey in the system carries a trace of hue 60 rather than being cold, which is what
keeps a food product from reading like a finance dashboard.

**Key Characteristics (as built):**
- Stock shadcn primitives; no custom component language yet
- Warm-biased neutrals throughout (hue 60, chroma 0.002–0.012)
- Single saffron accent; no secondary or tertiary accent exists
- Full light and dark themes, both maintained
- Geist Sans and Geist Mono
- Flat surfaces separated by hairlines rather than shadow

## Colors

A near-monochrome warm neutral field with exactly one accent. There is no secondary or
tertiary colour in this system, and inventing one is a design decision, not a fix.

### Primary
- **Saffron** (`oklch(0.66 0.16 60)`): the only accent. Primary buttons, focus rings,
  active navigation, and every emphasis state. Its foreground is a near-white with the
  same warm bias.

### Neutral
- **Warm White** (`oklch(0.995 0.002 60)`): page and card background. Not pure white —
  the faint warm cast is deliberate.
- **Warm Ink** (`oklch(0.16 0.006 60)`): primary text.
- **Muted Ink** (`oklch(0.55 0.012 60)`): secondary and supporting text. Marketing copy
  currently leans on this heavily.
- **Warm Wash** (`oklch(0.97 0.004 60)`): muted, secondary and accent surfaces — all
  three tokens resolve to the same value, so "accent" is not visually distinct.
- **Warm Panel** (`oklch(0.975 0.006 60)`): the sidebar, deliberately a step deeper
  than content so the navigation panel separates without a border.
- **Hairline** (`oklch(0.92 0.004 60)`): borders and input strokes.

### Status
- **Destructive** (`oklch(0.577 0.245 27.325)`): the one unwarmed colour in the system,
  inherited from shadcn defaults.

### Named Rules
**The Warm Neutral Rule.** Every neutral carries hue 60. A cool grey dropped into this
palette reads instantly as foreign and makes the food product feel clinical. If the
identity is replaced, this bias is the one thing worth carrying forward.

**The Single Accent Rule.** Saffron is the only accent that exists. Charts are
deliberately greyscale (`--chart-1` through `--chart-5` are pure neutrals) so data
never competes with an action.

## Typography

**Display Font:** Geist (with `system-ui`, sans-serif fallback)
**Body Font:** Geist — one family throughout
**Label/Mono Font:** Geist Mono

**Character:** Neutral by construction. Geist is a well-drawn but deliberately
characterless grotesque, which is exactly why it reads as a placeholder here: it makes
no claim. Headings are set at `font-semibold tracking-tight`, body at regular weight in
muted ink. There is currently no display treatment distinct from a large heading.

### Hierarchy
- **Page title** (600, 1.875rem, tracking `-0.025em`): one per page.
- **Section heading** (600, 1.25rem): card and section headers.
- **Body** (400, 1rem, line-height 1.5): running text, usually in muted ink.
- **Label** (500, 0.875rem): form labels and table headers.
- **Mono** (Geist Mono): reserved for numbers that must align — amounts, counts, ids.

## Layout

Standard shadcn application shell: a fixed warm sidebar beside a scrolling content
column, with marketing pages using a centred `max-w-2xl` measure. Spacing follows
Tailwind's default scale; there is no custom rhythm. Density is comfortable rather than
compact, which suits the calendar and plan-builder surfaces where every row is a
decision.

## Elevation & Depth

**This system is flat.** Depth comes from tonal steps between surfaces — content at
`0.995`, sidebar at `0.975`, wash at `0.97` — plus hairline borders. Shadows are only
what shadcn's popovers and dialogs bring by default; nothing in the application layer
adds elevation of its own. Tonal layering, not shadow, is the depth language, and that
is worth stating explicitly because it is otherwise invisible in the token file.

## Shapes

A single radius scale derived from `--radius: 0.625rem`, with `sm`/`md`/`lg`/`xl`
computed as multiples. Uniformly soft, no sharp corners, no pill treatments outside
badges. There is no distinctive form language — this is the clearest signal that the
visual identity has not been designed yet.

## Components

Stock shadcn primitives, unmodified except by the token layer: button, card, input,
table, dialog, sidebar, badge, tabs. There is no component in this codebase whose
appearance is specific to Tiffin Grab, so there is nothing product-specific to
document.

The surfaces that *should* eventually carry the identity, and currently do not:

- **The plan builder** — the four-axis wizard is the product's whole positioning and
  currently looks like a generic multi-step form.
- **The delivery calendar** — where subscribers spend their time after subscribing.
- **The weekly menu** — the only surface where food is the subject.

## Do's and Don'ts

### Do:
- **Do** keep every neutral warm (hue 60). It is the one deliberate decision in the
  current palette.
- **Do** keep charts greyscale so saffron always means "action".
- **Do** maintain both light and dark themes; both are currently complete.
- **Do** treat the plan builder, delivery calendar and weekly menu as the surfaces
  where an identity should be established first.
- **Do** replace this system rather than decorate it, when identity work begins.

### Don't:
- **Don't** treat this file as a brand commitment. It is a record of what shipped, and
  the operator has marked it a placeholder.
- **Don't** introduce a cool grey.
- **Don't** add a second accent colour without deciding what it means; there is
  currently exactly one and no semantic slot for another.
- **Don't** invent a component language piecemeal across screens. The next identity
  should be established once and applied, not accreted.
- **Don't** copy Puchkaman's neobrutalist system here. It belongs to a different
  product with a different audience.
