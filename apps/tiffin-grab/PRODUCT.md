# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three confirmed subscriber audiences, each arriving with a different reason to hand
over cooking:

- **Students and newcomers.** Away from home, cooking is a chore, budget is tight.
  Price and how long they must commit matter most.
- **Working professionals.** No time to cook on weeknights. Reliability, schedule
  control and the ability to skip a day matter most.
- **Families.** Feeding a household, so meal size and variety carry the decision.

Diet is a mechanism, not an audience: the nutrition baseline is where the plan
builder starts, but it is not why any of these three subscribe.

Two internal audiences share the same login:

- **Sales staff** work an inquiry pipeline and create orders on a customer's behalf.
- **Admins** control the catalog, weekly menu releases, delivery zones, user roles and
  per-user feature flags.

## Product Purpose

Tiffin Grab delivers home-style, customizable meals on a subscription. A subscriber
builds their own plan — nutrition baseline, meal size, delivery rhythm, commitment
length — then picks what actually arrives each day from a released weekly menu, and
manages the subscription themselves afterwards.

Success is a subscriber who keeps their plan running because it bends around their
life instead of the reverse.

## Positioning

**You build the plan.** Most tiffin services sell one fixed plan and one menu. Here
every axis is the subscriber's: what nutrition baseline, what size, how often, for how
long. Weekly meal-picking and post-subscription control (skip, hold, vacation,
reschedule, makeup deliveries) are what make that promise survive contact with a real
week.

## Operating Context

- **Multi-market by design.** Confirmed as genuinely operating in more than one
  market, which is why currency, timezone, cutoff hour and default country are all app
  settings rather than constants. `getAppSettings()` is the single authority; nothing
  should hardcode a currency, a timezone or a phone country.
- Greater Toronto Area coverage is described in the app's own copy as eleven regions,
  delivered on slot windows matched to the neighbourhood.
- Meals are cooked in small batches as balanced thalis and bowls.
- Admins release a weekly menu; subscribers then choose per-day meals for that week.
  Menus are released per week and do not fall back to another week.
- A daily cutoff hour governs how late a change can still affect tomorrow's delivery.
- Delivery routing runs through OptimoRoute; printed labels accompany the run.
- Subscriptions are prepaid, with a wallet and monthly bills rather than pay-per-meal.

## Capabilities and Constraints

- Single login resolves three roles: `admin`, `member` (sales), `user` (customer).
- **Currency is stored in minor units with a companion currency code** and formatted
  through `Intl`; the market decides the locale, not the code.
- The entire app — including which week a menu belongs to — follows the app-settings
  timezone. Week boundaries are computed in that timezone, never the server's.
- Pricing and totals are computed server-side only; client-submitted amounts are never
  trusted. Audit fields are stamped from the session, never from input.
- Subscription control surface: skip days and holds, vacation pause with resume,
  reschedule to a chosen date (consuming a hold day), and makeup deliveries appended
  after the plan's last delivery.
- Money runs through prepaid orders, payments and ledger entries; wallet coins are a
  separate ledger from money.
- Customer support ticketing lives in the customer app, with an order or subscription
  attachable and file uploads on create.
- Transactional email runs through SES, including verification, password reset and
  security alerts.
- Built inside the Realm monorepo as its first client app, sharing the `@realm/*`
  packages; app-specific product decisions live here, not at the repo root.

## Brand Commitments

- Name **Tiffin Grab**.
- Voice is plain and practical: "a good tiffin should fit your diet, your schedule,
  and your budget — not the other way around."
- Home-style and small-batch is a product claim, not decoration; do not soften it into
  generic meal-kit language.

## Evidence on Hand

- No customer testimonials, reviews, press, awards, subscriber counts or benchmarks
  exist. Future work must not invent any.
- No brand or food photography library is present in the app's public assets; imagery
  is uploaded content and Lottie animation. Any surface needing food photography needs
  real assets supplied first.
- The eleven-GTA-region figure comes from the app's own marketing copy and should be
  reconciled against the live delivery-zone records before it is repeated as a claim.

## Product Principles

1. **Every axis belongs to the subscriber.** If a decision could reasonably be theirs
   — size, rhythm, duration, today's meal — it is.
2. **A subscription must bend, not break.** Life interrupts; skip, hold, vacation and
   makeup exist so an interruption never costs a paid meal.
3. **Settings decide the market, code never does.** Currency, timezone, cutoff and
   country come from app settings so a second market needs no fork.
4. **The server owns money and time.** Totals and week boundaries are computed
   server-side, in the configured timezone.
5. **Never fabricate proof.** With no reviews, counts or photography on hand,
   credibility has to come from clarity about how the plan actually works.
