# Foundry

Shared TypeScript packages (`@foundry/*`) for Realm apps, Relay, and Monarch (AI).

This tree is the packages repo. It has no apps. GitHub `a6n-ai/foundry` should be split from here when the org can create that remote.

- Floor: commons, themes, ui, design-system, crm, auth, auth-ui, database, routes, storage, realtime, eslint-config
- Commerce: clover, payments, wallet, coupons, google-reviews, order-tracking, places
- Email contract + render (`@foundry/email`) so Foundry never imports Relay; SES lives in `@relay/email`
- AI: `@foundry/ai` — Monarch packages live here, not in Realm or a separate monarch packages tree

Foundry never imports Relay.
