# Realm — Repository Structure

Realm is a **multi-client Turborepo**. One platform, many client apps that share
UI, CRM shell, services, and utilities. TiffinGrab is the first client; Gym,
Dentist, Realtor, etc. are added as sibling apps.

```
realm/  (repo root)
├── apps/
│   └── tiffin-grab/          the first client app (Next.js 16, App Router)
├── packages/                 shared platform code — scope @realm/*
│   ├── commons/              framework-agnostic core: DTOs, Condition DSL,
│   │                         errors, enums(Role), pagination, util/* (dates,
│   │                         zoned-time, code, pin, contact, password schema,
│   │                         money), LRU cache, pino logger (./logger subpath)
│   ├── database/             Drizzle repo + service base (BaseService,
│   │                         BaseRepository, managed-field stamping, actor hook)
│   ├── routes/               Next route factories (createCollectionRoute/…),
│   │                         list-param parse, response + error-mapper
│   ├── storage/              S3/local/memory storage, file-detail, secured
│   │                         access, files schema  (server-only)
│   ├── email/                SES email, react-email render, interpolate
│   │                         (server-only)
│   ├── ui/                   33 shadcn/radix primitives + cn + Text + support hooks
│   ├── design-system/        generic ds/* compositions over @realm/ui
│   │                         (page-shell, stat-card, filter-bar, breadcrumbs…)
│   ├── crm/                  slot-based <CrmShell> dashboard scaffold
│   ├── themes/               ThemeProvider/useTheme + no-flash script + tokens
│   └── auth/                 createRoleGuards(getSession) + bcrypt hashing
│                             (server-only)
├── tooling/
│   └── eslint-config/        shared Next ESLint presets (@realm/eslint-config)
├── turbo.json                task graph + cache config
├── pnpm-workspace.yaml       globs: apps/*, packages/*, tooling/*
└── tsconfig.base.json        base TS config every package extends
```

## Package taxonomy

| Package | Scope/name | Purpose | Client-consumed? |
|---|---|---|---|
| `commons` | `@realm/commons` | core utils, DTOs, errors, enums, money, logger | yes |
| `database` | `@realm/database` | Drizzle service/repo base | yes |
| `routes` | `@realm/routes` | Next route factories | yes |
| `storage` | `@realm/storage` | file storage subsystem | server-only |
| `email` | `@realm/email` | SES email / render | server-only |
| `ui` | `@realm/ui` | primitives + `cn` + `Text` (+ subpaths `./button`, `./cn`, …) | yes |
| `design-system` | `@realm/design-system` | ds compositions over ui | yes |
| `crm` | `@realm/crm` | `<CrmShell>` scaffold | yes |
| `themes` | `@realm/themes` | provider + tokens + no-flash script | yes |
| `auth` | `@realm/auth` | guard factory + bcrypt | server-only |
| `eslint-config` | `@realm/eslint-config` | shared lint presets | build-time |

**Client-consumed** packages must be listed in `apps/<client>/next.config.ts`
`transpilePackages` (they ship raw `.ts`/`.tsx` source — no build step).
**Server-only** packages (`@realm/storage`, `@realm/email`, `@realm/auth`) are NOT
transpiled — they run only in server code and Next resolves them directly.

## Dependency layering (acyclic, bottom-up)

```
commons, themes              (floor — no workspace deps beyond commons)
  ← ui                       (imports themes; peer react/next)
  ← design-system            (imports ui; peer next)
  ← crm                      (imports ui + design-system)
  ← apps/tiffin-grab         (imports everything; NOTHING imports the app)

routes         → commons + database
auth           → commons
```

Rules that keep it acyclic:
- `themes`/`ui` never import `design-system`/`crm`.
- `design-system` composes `ui`; `ui` never imports `design-system`.
- **`crm` never imports the app.** The dashboard shell is slot-based:
  `<CrmShell>` takes rendered `sidebar`/`breadcrumbs`/`actions`/`footer` slots,
  so all app services and nav config stay in `apps/tiffin-grab`.
- App-specific things injected as props, never baked into a package:
  `SECTIONS` (nav), `ROUTE_LABELS` (breadcrumbs `resolveLabel`), `getSession`
  (auth guards), the role groupings (`requireAdmin`/`requireStaff`).

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
