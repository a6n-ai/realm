---
name: Tiffin Grab
description: A soft, warm-cream identity for the public and customer surfaces (cream page, hairline cards, pill CTA with glow, one italic saffron accent word)
colors:
  brand-orange: "#F06B1A"
  brand-orange-foreground: "#FFFFFF"
  brand-orange-hover: "#D85F14"
  primary-wash: "#FBE3D2"
  warm-cream: "#FBF4E7"
  warm-ink: "#241F1B"
  card-white: "#FFFFFF"
  warm-wash: "#F1EEE5"
  muted-ink: "#6E6558"
  hairline: "#E3DFD1"
  forest: "#1D5C32"
  destructive: "oklch(0.577 0.245 27.325)"
typography:
  display:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "clamp(28px, 5vw, 40px)"
    fontWeight: 700
    letterSpacing: "-0.03em"
  sheet-title:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "-0.02em"
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
  chip: "10px"
  input: "16px"
  card: "24px"
  sheet: "28px"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.brand-orange}"
    textColor: "{colors.brand-orange-foreground}"
    rounded: "{rounded.full}"
    height: "52px"
  card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.card}"
  input:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.input}"
---

# Design System: Tiffin Grab

Applies to public, auth and customer (`/me`) surfaces. Admin/dashboard stays stock shadcn on Geist.

## Overview

Soft and warm, not brutal. A cream page, white cards edged by a 1px hairline (`#E3DFD1`), 24px card radius, 16px input radius, and a pill CTA with an orange glow. Each screen title carries one italic saffron accent word ("Build your *tiffin.*") above a tracked orange eyebrow. No offset punch shadows, no 1.5px ink borders on cards (the ink border survives only on outline buttons).

## Colors

Tokens live in `app/globals.css`; light / dark.

- Background `#FBF4E7` / `#14201A`; foreground `#241F1B` / `#F3EFE4`
- Card `#FFFFFF` / `#1B2921`; muted `#F1EEE5` / `#223229`; muted-fg `#6E6558` / `#A9AFA3`
- Border `#E3DFD1` / white 10%
- Primary (saffron) `#F06B1A` / `#FF9843`, hover `#D85F14` / `#FFA75E`, wash `#FBE3D2` / `#3A2A1C`
- Forest `#1D5C32` is status only, never decorative. Destructive is red, for errors only.

### Status palette (`--s-*`)

Each has `-fg` and `-bg` variants and always ships with a label and a shape, never color alone.

| Token | Meaning | Shape cue |
|---|---|---|
| `--s-delivered` | Delivered (emerald) | emerald ring around date |
| `--s-upcoming` | Upcoming (sky) | solid dot |
| `--s-hold` | On hold (rose) | dot |
| `--s-vac` | Vacation (amber, distinct from brand orange) | dot |
| `--s-combined` | Combined into another trip | dashed ring |
| `--s-locked` | Locked past cutoff | plain, muted |

## Typography

Poppins 400-700 everywhere in public and customer (the customer shell opts in with `.customer-app`, overriding the `.crm-app` Geist rule). Eyebrow 12/600 +0.25em uppercase saffron; display clamp(28,5vw,40)/700 -0.03em; sheet title 22/700; body 16/1.5; secondary 13-14; pills and chips 12-13/600. All numbers `tabular-nums`.

## Shape and elevation

Card 24, input and date cell 16, chip 10, pill and button 9999, sheet top corners 28. Flat by default; the only shadow is the CTA glow `0 12px 30px -8px` primary at 70%, on one primary action per screen, plus overlay shadow on sheets. Tap targets at least 44px (primary 52); pills 28px tall on a wash background with matching ink.

## Motion

`--ease-soft` cubic-bezier(.22,1,.36,1) for sheets (`--dur-sheet` 400ms) and scrims (250ms). `--ease-spring` cubic-bezier(.34,1.56,.64,1) for press (`--dur-press` 150ms, scale .97), toggles (`--dur-toggle`), toasts (`--dur-toast`). `prefers-reduced-motion` collapses to opacity only.

## Do's and Don'ts

- Do keep one saffron accent word per heading and one glowing primary per screen.
- Do use hairline cards; do not add ink borders or offset shadows.
- Do pair every status color with text and a shape.
- Don't use hover-only affordances; explanations are visible text.
- Don't apply this language to admin surfaces.
