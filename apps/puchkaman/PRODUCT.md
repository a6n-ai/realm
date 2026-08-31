# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

No single primary audience — the operator confirmed all four order regularly, which
is why the menu spans traditional, fusion, late-night and catering at once:

- **Curious food explorers.** GTA food-scene people who found the fusion puchkas on
  Instagram and came for the novelty. They arrive without knowing the vocabulary.
- **South Asian diaspora.** Families and students who know what a real puchka is and
  judge it against Kolkata, not against Indian takeout.
- **Late-night locals.** Scarborough regulars ordering into the small hours; the
  kitchen is open when almost nothing comparable nearby is.
- **Groups and occasions.** Catering, watch parties and events — ordering for a crowd
  rather than for themselves.

Staff are a second, separate audience: counter and kitchen staff work the Clover
Register, and admins run the CRM dashboard in the same app.

## Product Purpose

Puchkaman is a Kolkata street-food cafe in Scarborough. This site is its **full
storefront**, not a brochure: direct pickup and delivery ordering, catering and event
inquiries, and the menu itself all run through it. Delivery apps are a secondary
channel.

Success is an order placed directly — which is also why direct ordering carries a
discount the apps cannot match.

## Positioning

**Fusion puchkas.** Global flavours built on an authentic puchka base — the viral hero
of the menu and the thing a neighbouring Indian takeout could not truthfully claim.
The house framing is street food, not restaurant food.

## Operating Context

- Single storefront: 3315 Danforth Ave, Scarborough, ON. Phone (416) 738-3833.
- Hours 15:00–02:00 Sun–Thu, 15:00–03:00 Fri–Sat. The late close is deliberate and
  serves a real audience; it is not an incidental detail.
- **Pickup:** ready in roughly 15 minutes.
- **Instant delivery:** within 7km of the store, discounted relative to the apps.
- **Scheduled delivery:** beyond 7km, minimum order, customer picks a time slot.
- **Delivery apps:** Uber Eats and DoorDash are live; SkipTheDishes is not yet.
- Food is assembled to order, which is what the pickup window and delivery radius
  exist to protect.
- Staff run Clover Register at the counter; web orders land there as POS tickets.

## Capabilities and Constraints

- **Clover POS is the source of truth** for which products exist, their price, their
  tax and their stock. The site mirrors Clover; it never overrides it.
- Card payment runs through Clover Ecommerce with hosted iframe fields — card data
  never touches this app. Apple Pay and Google Pay are supported by Clover and
  deliberately deferred. ACH is US-only and therefore unavailable here.
- Uber Eats is used **only** as a source of product photography, never as a catalogue
  authority.
- Discounts and coupons come from synced Clover discounts. Clover has no coupon-code
  concept, so the code is the one locally-owned field; no expiry, usage cap or
  minimum-spend rules exist, in Clover or here.
- A phone number is required at checkout and stored E.164 — the kitchen calls when an
  order stalls and couriers need it.
- Catering and event inquiries are captured on the site and worked by staff.
- Built inside the Realm monorepo and shares the `@foundry/*` packages with sibling
  client apps; app-specific product decisions live here, not at the repo root.

## Brand Commitments

- Name **Puchkaman**, at puchkaman.ca. Instagram @puchkamancanada.
- Voice is street, not restaurant: "the street, the crunch, and the chaos — done
  right." Plain and unfussy, never fine-dining.
- Existing logo asset at `public/logo.webp`.
- The public storefront and the staff CRM are deliberately different worlds and are
  not to be unified.

## Evidence on Hand

- Real storefront photograph at `public/about/storefront.jpg`, currently doing double
  duty as the Open Graph image — no purpose-built social image exists yet.
- Product photography synced from the live Uber Eats listing.
- Address, phone and hours are verified against the Google business listing.
- **No testimonials, press, reviews, awards, customer counts or benchmarks exist.**
  Future work must not invent any.

## Product Principles

1. **Clover is the truth.** Anything about what exists, what it costs and what it is
   taxed at comes from the POS. The site never becomes a second catalogue.
2. **Direct beats the apps.** Every surface should make ordering here easier and
   better-priced than ordering through a delivery app.
3. **Serve four audiences without picking one.** A newcomer must be able to order
   without knowing the vocabulary; someone from Kolkata must not feel talked down to.
4. **Freshness sets the geography.** Pickup windows, the delivery radius and the
   scheduling rules all exist to protect food assembled at the last moment.
5. **Never fabricate proof.** With no reviews or press on hand, credibility comes from
   real photography, real hours and a working order flow.
