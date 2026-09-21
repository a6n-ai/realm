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

Soft and warm, not brutal. A cream page, white cards edged by a 1px hairline (`#E3DFD1`), 24px card radius, 16px input radius, and a flat 14px-radius button (the wizard Next), with the glowing pill reserved for hero CTAs. Each screen title carries one italic saffron accent word ("Build your *tiffin.*") above a tracked orange eyebrow. No offset punch shadows, no 1.5px ink borders on cards (the ink border survives only on outline buttons).

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

Card 24, input and date cell 16, chip 10, pill 9999, button 14 (hero CTA 9999), sheet top corners 28. Flat by default; the only shadows are the hero CTA glow `0 12px 30px -8px` primary at 70% and overlay shadow on sheets. Tap targets at least 44px (primary 52); pills 28px tall on a wash background with matching ink.

## Motion

`--ease-soft` cubic-bezier(.22,1,.36,1) for sheets (`--dur-sheet` 400ms) and scrims (250ms). `--ease-spring` cubic-bezier(.34,1.56,.64,1) for press (`--dur-press` 150ms, scale .97), toggles (`--dur-toggle`), toasts (`--dur-toast`). `prefers-reduced-motion` collapses to opacity only.

## Do's and Don'ts

- Do keep one saffron accent word per heading and one glowing primary per screen.
- Do use hairline cards; do not add ink borders or offset shadows.
- Do pair every status color with text and a shape.
- Don't use hover-only affordances; explanations are visible text.
- Don't apply this language to admin surfaces.

# Customer design system (derived from /subscribe)

Source of truth: `components/wizard/*`, `app/(public)/subscribe/*`. Living guide: `/me/design-system` (dev only). Kit: `components/customer/kit` (no shadcn / `@foundry/ui` in the customer app). Tokens: `app/globals.css`, section "Customer design system", scoped to `.customer-app`.

## Principles
1. Bold type, big soft cards, pill controls, saffron on cream. One italic saffron accent word per title.
2. One primary action per screen, with the glow. Everything else is outline or quiet.
3. Never color alone; explanations are visible text; 44px minimum targets (CTA 52, wizard day pills 48).
4. Mobile first; same components on desktop, only the grid widens.

## Tokens (wizard value -> variable)
| Value | Token |
|---|---|
| Cream page / card / muted / hairline | `--background` `--card` `--muted` `--border` (dark: green-black `#14201A` / `#1B2921`) |
| Saffron, hover, wash | `--primary` `#F06B1A`/`#FF9843`, `--primary-hover`, wash `#FBE3D2`/`#3A2A1C`; selected fill = primary at 10% |
| Radii: chip 10, input 16, option card 20, card 24, sheet 28, pill 9999 | `--c-radius-chip/input/select/card/sheet` |
| CTA glow `0 12px 30px -8px` primary 70% | `--c-shadow-cta` |
| Sheet shadow, scrim `rgb(20 16 12 / .45)` | `--c-shadow-sheet`, `--c-scrim` |
| Heights: tap 44, wizard pill 48, CTA 52, input 52 | `--c-h-tap/pill/cta` |
| Motion: soft `(.22,1,.36,1)` 400ms sheets, 250ms scrim; spring `(.34,1.56,.64,1)`; press scale .97 in 100-150ms; wizard step slide 24px, spring bounce 0 / 400ms | `--c-ease-*`, `--c-dur-*` |
| Glass bar: background 72% + blur 20 saturate 180 | `.c-glass` |

## Typography (Poppins)
| Class | Spec | Use |
|---|---|---|
| `.c-eyebrow` | 12/600, +0.25em, uppercase, saffron | above page title |
| `.c-title` | 34-40 / 1.06 / 700 / -0.03em | wizard question |
| `.c-title-page` | 28-40 / 1.08 / 700 / -0.03em | page header |
| `.c-accent` | italic, saffron | one word in a title |
| `.c-h2` | 22 / 700 / -0.03em | card and sheet titles |
| `.c-label` | 13 / 600 / +0.02em muted | section labels |
| `.c-body` / `.c-caption` | 16/1.5 ; 13 muted | copy |
| `.c-stat` | 28 / 700 tabular saffron | numbers (40 in previews) |

## Layout and spacing
Content column `max-w-3xl` (wizard) centered, 16px mobile gutter, sections `space-y-8`, option grids `gap-3` (day pills `gap-1.5/2`), card padding 16-20. Mobile pads bottom for the fixed bar (`pb-44`).

Page header: eyebrow, bold title + italic saffron accent, optional subtitle, ONE primary action right-aligned (`PageHeader`).

## Top bar anatomy
Brand (left) | pill nav: Deliveries, Menu, Account (`NavPill`, saffron wash when current) | `CoinChip` (wallet icon + tabular balance, links to `/me/wallet`, active state on `/me/wallet*`; it is the ONLY entry to Finances, not a nav pill) | ONE `ThemeToggle`. ThemeToggle is a single 44px icon button showing the current theme; one tap cycles light, dark, system (chosen over a popover: one tap, no overlay to dismiss); aria-label announces current and next. The full Light/System/Dark choice (`Segmented`) also lives in the Menu sheet. Mobile: brand, coin chip, theme button on top; `TabBar` at bottom with exactly three tabs (Deliveries, Menu, Account). There is no floating Order button: a new order is the first row of the Menu sheet ("New order", above Weekly menu and Renew plan), so nothing competes with the sticky trip action bar that sits directly above the tab bar. The desktop Menu pill opens the same sheet.

Deliveries hub (`/me`): calm and selection-first. Title, then ONE quiet plan line (size - diet, tiffins left, hold days, renews in N days) that wraps. Desktop (>=1024): two columns, a plain trip list (weekday + date, "1 tiffin" or "Covers Mon + Tue", status dot + word; merged-source days have no row; next 8 with Show earlier / Show more) and ONE trip card (big date, status, cutoff in plain words, dishes deduped as "Bhindi Masala x2", then Pick meals as the primary button, Swap / Hold / Move as outline buttons, and "Going away? Vacation" as a text link). Mobile: title + Vacation text link, 7-day week strip, trip card, sticky action bar above the tab bar, and an Upcoming list collapsed to 3 (See all). `?trip=` selects a trip, `?action=pick|swap|hold|move|vacation` opens its sheet.

## Components (kit)
- Button: the wizard Next button. 14px radius, 1.5px border, 50 (lg, 17/600, tracking -0.022em) / 44 (md, 15/600); primary = flat saffron, outline = ink border, quiet = hairline card, danger = rose outline; no shadow; press scale .97; disabled 45% opacity but `disabledReason` keeps it focusable and prints the reason. `hero` is the only glowing pill (full radius, 52px, glow `0 12px 30px -8px`), reserved for hero calls to action. Sticky CTA bars in sheets use the standard button.
- Pill (28px, 12/600, tone wash) and Chip (28px, 10px radius, 13px tabular).
- Card: 24px, 1px hairline, white/`--card`. `selected` = primary border + 10% wash.
- SelectableCard: 20px, 2px border, min-h 96, title `c-h2`, optional round arrow/check indicator; `aria-pressed`.
- Sheet: bottom 28px radius w/ grabber on mobile, right panel 440px on desktop, title `c-h2`, close 44px, sticky footer CTA, focus trap, Esc, drag to dismiss.
- Field: label 14/600, 52px input, 16px radius, 1px hairline; error border rose + `role=alert` text. Toggle 52x32, Stepper pill 44 buttons.
- Tabs / Segmented: pill 44; active = ink fill.
- DateStrip / MonthGrid / DateCell: 16px cells, emerald ring delivered, dashed combined.
- NavPill, CoinChip, ThemeToggle, TabBar (56px, 11/600 labels), BottomBar (glass, hairline, safe-area, note above CTA).
- PageHeader, StatTile (20px, label, saffron `c-stat`), ListRow/ListGroup (56px rows, 24px group, chevron when link), EmptyState (dashed 24px, wash icon), MenuSection (label + rows), Notice/Reason, Toast (ink pill bottom), Skeleton (muted, 16px).

## Motion and accessibility
Press scale .97 (100ms), sheets 400ms soft ease, toggles and toasts spring 250ms. `prefers-reduced-motion`: opacity only. Visible 2px saffron focus outline offset 2. Targets >= 44. `aria-pressed` for choices, `aria-current` for nav, `role=status/alert` for messages. Reduced transparency makes glass opaque.

## Templates (ASCII)
```
HUB (desktop)                          HUB (mobile)
eyebrow                                eyebrow
Title *accent*            [Primary]    Title *accent*
[StatTile][StatTile][StatTile]         [StatTile][StatTile]
[ Card list / ListGroup          ]     [ ListGroup            ]
                                       [Home|Menu|Deliv|Acct]

DETAIL LIST            FORM PAGE                 SETTINGS PAGE
Back  Title            Title *accent*            Tabs (desktop) / rows (mobile)
[Card][Card]           Field  Field              ListGroup > ListRow > chevron
[Card]                 ...                       Toggle rows
                       [BottomBar: Back|Save]
```

## Wizard reuse, matches and drift
Reusable as-is: option cards (now `SelectableCard`), day pills (h-48 pill, primary fill), progress bar (h-1 rounded, primary/border), glass bottom bar (`BottomBar`), invoice sheet (`Sheet`).
Fixed: Card selected ring became 10% wash + 2px border cue; Field 1.5px border/48px -> 1px/52px; Sheet radius on token.
Wizard still renders its Next through `@foundry/ui` Button + IOS_BUTTON; kit Button now matches it visually. Migrating the wizard is out of scope here.
