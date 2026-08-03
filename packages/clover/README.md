# @realm/clover

Clover Platform + Ecommerce integration for Realm client apps. Apps own
orders/payments/ledger schemas and domain services; this package is the shared
Clover surface (API, OAuth, inventory/employees, plugin UI).

## Layout

| Export | Contents |
|---|---|
| `@realm/clover` | OAuth, API client, inventory/employees/orders helpers, webhooks, store adapters, `createCloverClient` |
| `@realm/clover/plugin` | Client-safe plugin catalog metadata |
| `@realm/clover/ui` | Integrations card + Settings connect/disconnect panel |

Dependency rule: never imports an app. Persist via injected `IntegrationsConfigStore`.

## Add Clover to an app (checklist)

1. **Env** — `CLOVER_APP_ID`, `CLOVER_APP_SECRET` (Developer App Settings), optional webhook auth; set `BETTER_AUTH_URL` for OAuth redirect. Not needed for API-token mode (below).
2. **Deps** — `"@realm/clover": "workspace:*"` and add `@realm/clover` to `transpilePackages` (for `./ui`).
3. **Store** — implement `IntegrationsConfigStore` (usually `integrations_config` JSON) and pass it to `getCloverConnection` / `installCloverPlugin` / `createCloverClient`.
4. **Routes**
   - Settings → Integrations: render `CloverIntegrationsCard` with install/uninstall server actions.
   - Settings → Clover (after install): render `CloverSettingsPanel` with connect/disconnect actions.
   - `GET /api/integrations/clover/callback` — `parseCloverOAuthCallback` → `consumeCloverOAuthState` → `exchangeCloverAuthorizationCode` → `persistCloverOAuthConnection`.
5. **OAuth helpers** — use package `createCloverOAuthState`, `cloverOAuthRedirectUri`, `buildCloverAuthorizeUrl` (no app-local copies).
6. **Domain wiring (app-local)** — map Clover order/charge ids onto *your* orders/payments tables; call Platform/Ecommerce helpers from `@realm/clover` inside app services. Do not move order/finance schemas into this package.
7. **Optional** — inventory/employee sync pages and webhooks once the merchant is connected.

## Two ways to connect a merchant

`CloverConnection.authMode` picks the credential:

| | `oauth` (default) | `apiToken` |
|---|---|---|
| Credential | developer app + refreshable token pair | permanent merchant API token (Clover dashboard → Setup → API Tokens) |
| Needs `CLOVER_APP_ID`/`SECRET` | yes | no |
| Connect with | `startCloverConnectAction` → callback → `persistCloverOAuthConnection` | `verifyCloverApiToken` → `connectCloverWithApiToken` |
| Webhooks | yes | **no** — Clover only delivers to a registered app; sync manually |

Everything downstream (`createCloverClient`, every client method) is mode-agnostic:
auth resolves once in `CloverApiClient.getAccessToken()`.

Always call `verifyCloverApiToken` before persisting an admin-submitted token — a
wrong merchant id or environment otherwise lands a dead connection in config.

Generic Integrations catalog chrome (non-Clover plugin tiles) lives in `@realm/crm` (`IntegrationPluginCard`).
