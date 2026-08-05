---
name: Puchkaman
description: A Kolkata street-food storefront drawn like hand-painted stall signage
colors:
  signal-yellow: "#FCD807"
  signal-yellow-deep: "#F0C400"
  chutney-green: "#1F7A34"
  chutney-green-deep: "#17612A"
  ink: "#16140D"
  cream: "#FFF4DA"
  paper: "#FFFBF0"
  white: "#FFFFFF"
  mint-pop: "#16C79A"
  sticker-pink: "#FF8BA7"
  alert-red: "#DE2A1A"
  alert-red-deep: "#E22A18"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontWeight: 900
    lineHeight: 0.9
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Space Mono, ui-monospace, monospace"
    fontSize: "0.72rem"
    fontWeight: 700
    letterSpacing: "0.14em"
rounded:
  sm: "10px"
  md: "16px"
  lg: "26px"
  pill: "999px"
spacing:
  section: "64px"
  container: "1240px"
  gutter: "20px"
components:
  button-primary:
    backgroundColor: "{colors.chutney-green}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    padding: "14px 22px"
  button-yellow:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "14px 22px"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    padding: "14px 22px"
  button-large:
    backgroundColor: "{colors.chutney-green}"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "18px 28px"
  card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  pill:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "6px 11px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "13px 14px"
---

# Design System: Puchkaman

Scope: the **public storefront** only. The admin CRM deliberately runs a different
visual language built on the shared `@realm/*` conventions, and is not this system's
to define. That separation is a rule, not an oversight — see Do's and Don'ts.

## Overview

**Creative North Star: "The Street Cart Sign"**

This is a food stall rendered as an interface. Hand-painted stall signage is the whole
reference: thick outlines drawn so they read from across a street, colour laid flat
and loud, shadows that fall like a physical board rather than a rendered surface. The
page should feel built, not composited — every card and button has an edge you could
run a finger along.

The system is yellow-dominant and unafraid of it. Signal yellow is the page itself,
not an accent, and the work of the design is keeping that much saturation legible:
warm cream and paper carry the reading surfaces, ink does every border and every
shadow, and green is the one colour allowed to mean "go". Everything is drawn with the
same 3px ink stroke, so the whole storefront looks struck from one hand.

Restraint lives in the type, not the colour. Archivo at weight 900, uppercase, tracked
tight and set at a 0.9 line-height, does the shouting; Space Mono handles every small
label at wide tracking so the voice drops to a whisper the moment a detail matters.
There is no gradient, no blur, no soft shadow anywhere in this system, and adding one
would read as a different site.

**Key Characteristics:**
- Flat colour, zero gradients, zero blur
- 3px ink border on every surface, without exception
- Hard offset shadows at 0 blur — the board, not the glow
- Yellow as ground, green as the only "go", red reserved for failure
- Display type uppercase and heavy; every label monospace and wide-tracked
- Buttons that physically move under the press

## Colors

Flat, saturated, and warm throughout: nothing in this palette is desaturated toward
neutrality, and the greys that most systems use simply do not exist here.

### Primary
- **Signal Yellow** (`#FCD807`): the page ground itself — body background, hero
  sections, the nav bar. Not an accent to be sprinkled; it is the surface everything
  else sits on. **Signal Yellow Deep** (`#F0C400`) is its pressed and hover partner.

### Secondary
- **Chutney Green** (`#1F7A34`): the single "go" colour. Primary buttons, available
  badges, confirmation states, the paid screen. Darkened deliberately from the logo's
  own green (~`#349D45`, which only reached 3.4:1 with white text) to clear WCAG AA at
  5.4:1, because every green surface in this system carries white text.
  **Chutney Green Deep** (`#17612A`) is its pressed partner.

### Tertiary
- **Mint Pop** (`#16C79A`): used sparingly, only for VEG and NEW markers.
- **Sticker Pink** (`#FF8BA7`): used sparingly, only on rotated sticker accents.
- **Alert Red** (`#DE2A1A`): status only — validation errors, "Closed", required-field
  markers. It is deliberately *not* a brand accent.

### Neutral
- **Ink** (`#16140D`): every border, every shadow, and all body text. A warm near-black,
  never pure `#000`.
- **Cream** (`#FFF4DA`): the warm card and panel surface; the softer of two reading
  grounds.
- **Paper** (`#FFFBF0`): the calmer section background, used where a full yellow field
  would exhaust the eye.
- **White** (`#FFFFFF`): the brightest card surface, for content that must sit forward.

### Named Rules
**The One Go Rule.** Green means "this action proceeds" and nothing else. A green
surface that is not an action — a decorative green panel, a green heading — steals the
only signal the customer has for what to press.

**The Red Is Failure Rule.** Red never decorates. If it appears, something is wrong,
closed, or required. A red used for emphasis makes every genuine error invisible.

**The Yellow Is Ground Rule.** Yellow is where the page starts, not what you add at the
end. Reading surfaces sit *on* it in cream, paper or white — long-form text never sits
directly on yellow.

## Typography

**Display Font:** Archivo (with `system-ui`, sans-serif fallback), self-hosted
**Body Font:** Archivo — one family carries the whole system
**Label/Mono Font:** Space Mono (with `ui-monospace` fallback), self-hosted

**Character:** A single grotesque doing two jobs. At weight 900 and negative tracking
it behaves like painted signage; at 500 it reads as plain, unfussy text. Space Mono
enters only for small metadata, where its wide tracking and mechanical shapes make a
price, a category or an order id feel stamped rather than written.

### Hierarchy
- **Display** (900, `clamp()` scaled, line-height 0.9, tracking `-0.03em`, uppercase):
  page banners and section heroes. Set tight enough that two lines lock together as one
  mass.
- **Headline** (900, line-height 0.95, tracking `-0.02em`): every `h1`–`h4` on the
  public site inherits this automatically. Not uppercase by default.
- **Title** (800, ~1.08rem, line-height 1.15): product names and card headings.
- **Body** (500, 1rem, line-height 1.5): descriptions and running text. Keep to a
  comfortable measure; this face is wide and tires quickly at full container width.
- **Label** (Space Mono 700, 0.72rem, tracking `0.14em`, uppercase): kickers, pills,
  counts, status text, and anything numeric that must line up.

### Named Rules
**The Two Voices Rule.** Archivo shouts, Space Mono annotates. A label set in Archivo
loses the annotation quality; a heading set in Space Mono loses the signage quality.
There is no third voice.

**The Negative Tracking Rule.** Display and headline type always tracks negative
(`-0.02em` to `-0.03em`). Positive tracking is reserved exclusively for monospace
labels, where it is always generous (`0.04em`–`0.14em`).

## Layout

A single centred container at 1240px max-width with 20px gutters carries every page.
Sections use a 64px vertical rhythm, tightening on phones. The system is mobile-first:
grids collapse to two columns rather than one on phones — the card floors use
`minmax(min(228px, 40vw), 1fr)` so two products always fit down to 320px, because a
single-column menu on a phone reads as an unusably long list.

Sticky elements offset from a `--header-h` custom property (70px desktop, reduced on
phones) so a sticky filter rail or category bar never hides under the nav. Full-height
areas use `dvh`, never `vh`.

## Elevation & Depth

**There are no soft shadows in this system.** Depth is entirely physical: a 3px ink
border plus a hard-offset shadow at zero blur. Surfaces read as boards stacked on a
table, not as planes floating in space. Nothing is ever blurred, frosted, or given an
ambient glow.

### Shadow Vocabulary
- **Standard** (`box-shadow: 7px 7px 0 var(--sh-c)`): cards and panels at rest.
- **Small** (`box-shadow: 4px 4px 0 var(--sh-c)`): buttons, pills, focused inputs.
- **Large** (`box-shadow: 12px 12px 0 var(--sh-c)`): the rare hero surface that must
  sit forward of everything.

The shadow colour is a variable, not a constant. On an ink background the shadow turns
yellow or green, because an ink shadow on ink is invisible. Surface classes
(`.surface-yellow`, `.surface-ink`, `.surface-green`) reassign both the border and
shadow colour for everything nested inside them.

### Named Rules
**The Zero Blur Rule.** Every shadow in this system has a blur radius of `0`. A blurred
shadow anywhere breaks the physical metaphor instantly and reads as a different design
language.

**The Contrast Shadow Rule.** A shadow must contrast with the surface it falls on.
Never hardcode an ink shadow; use the surface-scoped variable so ink-on-ink and
green-on-green cannot happen.

## Shapes

Generously rounded rectangles, not sharp brutalist corners: 16px is the default card
radius, 10px for buttons and inputs, 26px for large hero surfaces, and full `999px`
pills for badges and chips. The softness of the corner is what keeps a 3px black
outline from feeling aggressive.

Two signature geometries recur. **Tape** is a small yellow label rotated `-1.5deg` with
a 2.5px border and a 3px hard shadow, used to mark a kicker as if stuck on. **Stickers**
are absolutely-positioned rounded pills, rotated slightly, sitting over the corner of a
card. Both exist to break the grid deliberately; neither should ever be straight.

## Components

### Buttons
- **Shape:** softly rounded (10px; 16px at large size), full 3px ink border.
- **Primary:** Chutney Green fill with white text, 14px/22px padding, uppercase, weight
  800, slightly negative tracking. Large variant steps to 18px/28px.
- **Hover / Focus:** the button lifts toward the cursor — `translate(-2px, -2px)` while
  the shadow grows from 4px to 6px, over 80ms.
- **Active:** it presses in — `translate(2px, 2px)` and the shadow collapses to 1px.
  This is the system's signature interaction and should never be removed.
- **Variants:** white (default), yellow, ink (white text), cream. Ink and green fills
  lock their foreground colour through every state, because inheriting a hover colour
  once made these buttons blank.

### Chips / Pills
- **Style:** Space Mono 700 at 0.7rem, tracking `0.08em`, uppercase, 2.5px ink border,
  fully rounded, 6px/11px padding.
- **Variants:** white default, green (white text), yellow, ink (yellow text), mint.
- **State:** in filter contexts a selected chip takes the green or ink fill and gains a
  3px hard shadow; unselected stays cream with no shadow.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** white by default; cream for grouped or secondary panels; yellow,
  green and ink for full-bleed feature surfaces.
- **Shadow Strategy:** the standard 7px hard offset — see Elevation & Depth.
- **Border:** 3px ink, always. A borderless card does not exist in this system.
- **Internal Padding:** `clamp(18px, 3vw, 26px)` for content panels.

### Inputs / Fields
- **Style:** white fill, 3px ink border, 10px radius, 13px/14px padding, minimum 48px
  tall on forms.
- **Focus:** no ring. The field lifts `translate(-1px, -1px)` and gains the 4px hard
  shadow — the same physical language as the buttons.
- **Error:** border switches to Alert Red and the shadow follows in red; the message
  sits below the field in Space Mono.
- **Labels:** always visible, above the field, Space Mono uppercase at 0.74rem.

### Navigation
- Flat yellow bar at 70px, ink bottom border, no shadow — it is the page ground, so it
  must not float above it. Links are Archivo 800. On phones the bar shortens and the
  menu moves behind a toggle.

### Signature: Surface Scoping
The `.surface-*` classes are the system's load-bearing idea. Applying `.surface-ink` to
a section reassigns border and shadow colours for every descendant, so a card dropped
into a dark section automatically switches from ink borders to yellow ones. New
sections should adopt a surface class rather than hand-setting colours on children.

## Do's and Don'ts

### Do:
- **Do** put a 3px ink border on every surface. The stroke is the system.
- **Do** use hard shadows at zero blur (`7px 7px 0`, `4px 4px 0`, `12px 12px 0`).
- **Do** keep the press interaction on interactive elements: lift on hover, sink on
  active. It is what makes the interface feel physical.
- **Do** set every small label in Space Mono, uppercase, with wide tracking.
- **Do** reach for a `.surface-*` class when building a new section, so nested borders
  and shadows recolour themselves.
- **Do** put long-form reading on cream, paper or white — never directly on yellow.
- **Do** keep the storefront and the admin CRM visually separate. They are different
  products to different people.

### Don't:
- **Don't** introduce gradients, blur, frosted glass, or any soft shadow. One instance
  breaks the whole metaphor.
- **Don't** use green for anything that is not an action, or red for anything that is
  not an error.
- **Don't** use pure black (`#000`) or a cool grey. Ink is warm (`#16140D`) and there
  are no greys in this palette.
- **Don't** set body text in weight 900 or headings in Space Mono.
- **Don't** hardcode an ink shadow colour; a surface-scoped shadow can land on ink.
- **Don't** let the mint or pink accents spread beyond their markers and stickers.
- **Don't** collapse product grids to one column on phones.
- **Don't** bring neobrutalist styling into the admin CRM, or CRM component styling
  onto the public storefront.
