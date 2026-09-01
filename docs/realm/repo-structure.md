# Realm — Repository Structure

Realm is a **multi-client Turborepo**. One platform, many client apps that share
UI, CRM shell, services, and utilities. TiffinGrab is the first client; Gym,
Dentist, Realtor, etc. are added as sibling apps.

```
realm/  (repo root — apps only plus extractable product trees)
├── apps/                     TiffinGrab, Puchkaman
├── foundry/                  @foundry/* packages (incl. @foundry/ai for Monarch)
├── relay/                    notification product: apps/relay + @relay/*
├── turbo.json
├── pnpm-workspace.yaml       apps/*, relay/apps/*  (@foundry/* and @relay/* from git)
└── tsconfig.base.json
```

## Package taxonomy

| Package | Scope/name | Purpose | Client-consumed? |
|---|---|---|---|
| `commons` | `@foundry/commons` | core utils, DTOs, errors, enums, money, logger | yes |
| `database` | `@foundry/database` | Drizzle service/repo base | yes |
| `routes` | `@foundry/routes` | Next route factories | yes |
| `storage` | `@foundry/storage` | file storage subsystem | server-only |
| `email` | `@relay/email` | SES email / render | server-only |
| `ui` | `@foundry/ui` | primitives + `cn` + `Text` (+ subpaths `./button`, `./cn`, …) | yes |
| `design-system` | `@foundry/design-system` | ds compositions over ui | yes |
| `crm` | `@foundry/crm` | `<CrmShell>` + generic Integrations plugin card chrome | yes |
| `themes` | `@foundry/themes` | provider + tokens + no-flash script | yes |
| `auth` | `@foundry/auth` | guard factory + bcrypt | server-only |
| `payments` | `@foundry/payments` | payment method config + providers | server-only |
| `wallet` | `@foundry/wallet` | coin ledger/earn/redeem service + `makeWalletTables` schema factory | server-only |
| `clover` | `@foundry/clover` | Clover OAuth + API + inventory/employees + OAuth helpers; `./plugin` + `./ui` for Integrations/Settings | server + client UI (`./ui`) |
| `eslint-config` | `@foundry/eslint-config` | shared lint presets | build-time |

**Client-consumed** packages must be listed in `apps/<client>/next.config.ts`
`transpilePackages` (they ship raw `.ts`/`.tsx` source — no build step).
**Server-only** packages (`@foundry/storage`, `@relay/email`, `@foundry/auth`) are NOT
transpiled — they run only in server code and Next resolves them directly.

## Dependency layering (acyclic, bottom-up)

```
commons, themes              (floor — no workspace deps beyond commons)
  ← ui                       (imports themes; peer react/next)
  ← design-system            (imports ui; peer next)
  ← crm                      (imports ui; CRM shell + generic Integrations chrome)
  ← clover                   (imports crm + design-system + ui for `./ui`;
                              server API/OAuth never imports apps)
  ← apps/*                   (imports everything; NOTHING imports the app)

routes         → commons + database
auth           → commons
payments       → (standalone payment-method config)
```

Rules that keep it acyclic:
- `themes`/`ui` never import `design-system`/`crm`.
- `design-system` composes `ui`; `ui` never imports `design-system`.
- **`crm` never imports the app or clover.** Generic admin chrome only
  (`CrmShell`, `IntegrationPluginCard`). Clover-specific UI stays in
  `@foundry/clover/ui` and may compose crm cards.
- **Orders / payments / ledger domains stay in apps** — do not extract into
  shared packages; `@foundry/clover` exposes Clover API helpers that apps wire
  into their own schemas/services.
- App-specific things injected as props/stores, never baked into a package:
  `SECTIONS` (nav), `ROUTE_LABELS` (breadcrumbs `resolveLabel`), `getSession`
  (auth guards), `IntegrationsConfigStore`, the role groupings
  (`requireAdmin`/`requireStaff`).

## What stays app-local (not shared)

Product surface and client-specific policy live in `apps/tiffin-grab`, not in a
package — until a second client proves something is genuinely shared:

- Feature surface: checkout, subscribe wizard, marketing, notifications, file
  cropper.
- The sidebar (`app-sidebar`, SECTIONS), global search, idle-lock, lock-button.
- `better-auth` config, `getSession` (bigint→publicId fail-closed), auth client,
  lock.
- Business badges (`order-status-badge`, `stage-badge`), route labels.
- Design tokens (`globals.css`) — per-client palette.

See `add-a-client.md` and `add-a-package.md`.
