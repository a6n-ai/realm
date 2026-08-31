# @foundry/clover

Clover Platform + Ecommerce integration for Realm client apps. Apps own
orders/payments/ledger schemas and domain services; this package is the shared
Clover surface (API, OAuth, inventory/employees, plugin UI).

## Layout

| Export | Contents |
|---|---|
| `@foundry/clover` | OAuth, API client, inventory/employees/orders helpers, webhooks, store adapters, `createCloverClient` |
| `@foundry/clover/plugin` | Client-safe plugin catalog metadata |
| `@foundry/clover/ui` | Integrations card + Settings connect/disconnect panel |

Dependency rule: never imports an app. Persist via injected `IntegrationsConfigStore`.

## Add Clover to an app (checklist)

1. **Env** — `CLOVER_APP_ID`, `CLOVER_APP_SECRET` (Developer App Settings), optional webhook auth; set `BETTER_AUTH_URL` for OAuth redirect. Not needed for API-token mode (below).
2. **Deps** — `"@foundry/clover": "workspace:*"` and add `@foundry/clover` to `transpilePackages` (for `./ui`).
3. **Store** — implement `IntegrationsConfigStore` (usually `integrations_config` JSON) and pass it to `getCloverConnection` / `installCloverPlugin` / `createCloverClient`.
4. **Routes**
   - Settings → Integrations: render `CloverIntegrationsCard` with install/uninstall server actions.
   - Settings → Clover (after install): render `CloverSettingsPanel` with connect/disconnect actions.
   - `GET /api/integrations/clover/callback` — `parseCloverOAuthCallback` → `consumeCloverOAuthState` → `exchangeCloverAuthorizationCode` → `persistCloverOAuthConnection`.
5. **OAuth helpers** — use package `createCloverOAuthState`, `cloverOAuthRedirectUri`, `buildCloverAuthorizeUrl` (no app-local copies).
6. **Domain wiring (app-local)** — map Clover order/charge ids onto *your* orders/payments tables; call Platform/Ecommerce helpers from `@foundry/clover` inside app services. Do not move order/finance schemas into this package.
7. **Optional** — inventory/employee sync pages and webhooks once the merchant is connected.

## Two ways to connect a merchant

`CloverConnection.authMode` picks the credential:

| | `oauth` (default) | `apiToken` |
|---|---|---|
| Credential | developer app + refreshable token pair | permanent merchant tokens (Clover dashboard → Setup → API Tokens) |
| Needs `CLOVER_APP_ID`/`SECRET` | yes | no |
| Platform (v3) auth | access token | `apiToken` |
| Ecommerce (v1) auth | *same* access token | `ecommercePrivateToken` — **a different credential** |
| PAKMS iframe key | fetched from `/pakms/apikey` | `ecommercePublicKey`, known upfront |
| Connect with | `startCloverConnectAction` → callback → `persistCloverOAuthConnection` | `verifyCloverApiToken` → `connectCloverWithApiToken` |
| Webhooks | yes | **no** — Clover only delivers to a registered app; sync manually |

Platform and Ecommerce are separate Clover API surfaces with separate tokens. A
single OAuth access token happens to work for both, which is what hides this —
under API-token auth they are not interchangeable. `CloverApiClient.bearerFor()`
routes by request origin, so callers never pick a token themselves.

The Ecommerce fields are optional: an integration that only syncs catalog and
employees never needs them. Checkout without them throws rather than 401s.

Everything downstream (`createCloverClient`, every client method) stays
mode-agnostic — auth resolves once, in `bearerFor` / `getAccessToken`.

Always call `verifyCloverApiToken` before persisting an admin-submitted token — a
wrong merchant id or environment otherwise lands a dead connection in config.

Generic Integrations catalog chrome (non-Clover plugin tiles) lives in `@foundry/crm` (`IntegrationPluginCard`).
